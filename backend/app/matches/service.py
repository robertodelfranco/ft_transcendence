"""Catálogo de Maps, criação de Match, resultado, estatísticas e histórico (matches-api.md §2.2–§2.4, rooms.md §2.2).

Cada mudança no lobby vai para todo /ws/app pelas funções `publish_*`, sempre **depois** do
commit: quem recebe o aviso e busca por HTTP já acha o banco atualizado (ws-manager.md §2.5).
"""
from collections import defaultdict
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from fastapi import Request
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.auth.schemas import DEFAULT_AVATAR_URL
from app.core.errors import ApiError
from app.game import TICK_RATE, Mode, load_map
from app.game.protocol import options_payload
from app.game.rooms import MAX_PLAYERS, MIN_PLAYERS, RoomInfo, RoomManager, now
from app.game.world import MAPS_DIR
from app.matches.models import Match, MatchPlayer, PlayerStats
from app.matches.schemas import (CreateMatchIn, HistoryMe, HistoryOther, MatchDetail, MatchHistoryItem,
	MatchHistoryPage, MatchPlayerRow, PlayerStatsOut, UserStats, parse_options)
from app.ws.app_events import publish_lobby_removed, publish_lobby_update, publish_match_started
from app.ws.manager import ConnectionManager


@dataclass(frozen=True)
class MapInfo:
	name: str
	max_players: int # o menor entre os Spawns do Map e o teto do Mode


Catalog = dict[Mode, list[MapInfo]]


# ---------- catálogo de Maps ----------

def load_catalog(maps_dir: Path = MAPS_DIR) -> Catalog:
	"""Lê backend/maps/{coop,pvp}/ uma vez, no startup. Map quebrado levanta InvalidMapError."""
	catalog: Catalog = {}
	for mode in Mode:
		names = sorted(path.stem for path in (maps_dir / mode).glob("*.txt"))
		maps = (load_map(name, mode, maps_dir=maps_dir) for name in names)
		catalog[mode] = [MapInfo(m.name, min(MAX_PLAYERS[mode], len(m.spawns))) for m in maps]
	return catalog


def get_catalog(request: Request) -> Catalog:
	return request.app.state.maps


# ---------- criar Match ----------

async def create_match(session: AsyncSession, rooms: RoomManager, connections: ConnectionManager,
		catalog: Catalog, user: User, body: CreateMatchIn) -> RoomInfo:
	"""Grava a linha de `matches` e abre a Room, na mesma requisição.

	Ordem: INSERT + flush → create + join (síncronos, sem await entre eles) → commit. A Room
	nunca existe sem linha; se o commit falhar, o criador sai e a Room some com ele.
	"""
	known = next((info for info in catalog[body.mode] if info.name == body.map), None)
	if known is None:
		raise ApiError(404, "map_not_found", f"map {body.map} not found")
	max_players = known.max_players if body.max_players is None else body.max_players
	if not MIN_PLAYERS[body.mode] <= max_players <= known.max_players:
		raise ApiError(422, "invalid_options", "invalid max_players", {"max_players": "invalid_value"})
	options = parse_options(body.mode, body.options)

	match = Match(mode=body.mode, map=body.map, max_players=max_players,
		options=options_payload(body.mode, options), created_by=user.id)
	session.add(match)
	await session.flush() # o id é o match_id da Room
	# o rollback expira os objetos da sessão (user inclusive): daqui em diante, só os ids locais
	user_id, match_id = user.id, match.id

	# daqui até o commit, a checagem de "um User, uma Room", o create e o join não têm await
	# entre si: dois pedidos do mesmo User não passam juntos (rooms.md §2.2). Checar depois do
	# flush, e não antes, é o que fecha a corrida; o rollback não deixa Match órfão
	if rooms.room_of(user_id) is not None:
		await session.rollback()
		raise ApiError(409, "already_in_other_match", f"user {user_id} is already in a match")
	rooms.create(match_id, body.mode, body.map, max_players, options, user_id)
	info = rooms.join(match_id, user_id, user.username, user.avatar_url or DEFAULT_AVATAR_URL)
	try:
		await session.commit()
	except Exception:
		rooms.leave(match_id, user_id) # último a sair: a Room é destruída
		raise
	await publish_lobby_update(connections, info)
	return info


# ---------- sair e iniciar ----------

async def leave_match(session: AsyncSession, rooms: RoomManager, connections: ConnectionManager,
		match_id: int, user_id: int) -> None:
	"""O último a sair grava aborted; o host que sai passa o created_by adiante (rooms.md decisão 3).

	A Room muda antes do banco e sem await: ninguém entra entre a saída e a gravação. A saída por
	presença (leave_when_offline) também passa por aqui, e por isso publica do mesmo jeito.
	"""
	info = rooms.leave(match_id, user_id)
	values = {"status": "aborted"} if info is None else {"created_by": info.created_by}
	await session.execute(update(Match).where(Match.id == match_id).values(**values))
	await session.commit()
	if info is None:
		await publish_lobby_removed(connections, match_id, "aborted")
	else:
		await publish_lobby_update(connections, info)


async def start_match(session: AsyncSession, rooms: RoomManager, connections: ConnectionManager,
		match_id: int, user_id: int) -> None:
	info = rooms.info(match_id)
	if info.created_by != user_id:
		raise ApiError(403, "not_host", f"user {user_id} is not the host of match {match_id}")
	rooms.start(match_id) # AlreadyStarted no segundo clique: uma task de tick só
	# ponytail: se este commit falhar, a Room roda com o banco em lobby e o record_match_result
	# ignora o resultado (só um warning); o abort_unfinished do próximo startup leva o lobby órfão
	await session.execute(update(Match).where(Match.id == match_id)
		.values(status="running", started_at=now()))
	await session.commit()
	# o match_started só para quem joga (a casca abre /play); o lobby_removed para todos
	await publish_match_started(connections, match_id, [player.user_id for player in info.players])
	await publish_lobby_removed(connections, match_id, "started")


async def leave_when_offline(rooms: RoomManager, connections: ConnectionManager,
		sessions: Callable[[], AsyncSession], user_id: int, online: bool) -> None:
	"""Quem fica offline sai do Lobby (rooms.md decisão 10); em partida, vale o Grace period."""
	match_id = rooms.room_of(user_id)
	if online or match_id is None or rooms.info(match_id).status != "lobby":
		return
	async with sessions() as session: # o __aenter__ não suspende: o status não muda no meio
		await leave_match(session, rooms, connections, match_id, user_id)


# ---------- resultado ----------

# as colunas de match_players que a tela mostra; username e avatar_url vêm de users
_PLAYER_COLUMNS = MatchPlayerRow.model_fields.keys() - {"username", "avatar_url"}


async def match_result(session: AsyncSession, match_id: int) -> MatchDetail:
	"""O Match terminado, lido só do banco, mesmo com a Room viva (matches-api.md decisão 8)."""
	match = await session.get(Match, match_id)
	if match is None:
		raise ApiError(404, "match_not_found", f"match {match_id} not found")
	if match.status == "aborted":
		raise ApiError(409, "match_aborted", f"match {match_id} was aborted")
	if match.status != "finished":
		# running: o game_over já saiu, mas o record_match_result ainda não gravou (§2.4)
		raise ApiError(409, "match_not_finished", f"match {match_id} is {match.status}")
	rows = await session.execute(select(MatchPlayer, User.username, User.avatar_url)
		.join(User, User.id == MatchPlayer.user_id)
		.where(MatchPlayer.match_id == match_id).order_by(MatchPlayer.user_id))
	players = [MatchPlayerRow(**{name: getattr(player, name) for name in _PLAYER_COLUMNS},
		username=username, avatar_url=avatar_url or DEFAULT_AVATAR_URL)
		for player, username, avatar_url in rows]
	return MatchDetail(match_id=match.id, created_by=match.created_by, mode=match.mode,
		map=match.map, status=match.status, options=match.options, started_at=match.started_at,
		ended_at=match.ended_at, duration_s=match.duration_ticks // TICK_RATE, result=match.result,
		reason=match.reason, players=players)


# ---------- estatísticas e histórico ----------

async def _ensure_user(session: AsyncSession, user_id: int) -> None:
	if await session.get(User, user_id) is None:
		raise ApiError(404, "user_not_found", "user not found")


async def user_stats(session: AsyncSession, user_id: int) -> UserStats:
	"""O agregado de player_stats por Mode (matches-api.md §2.3)."""
	await _ensure_user(session, user_id)
	rows = {row.mode: row for row in await session.scalars(
		select(PlayerStats).where(PlayerStats.user_id == user_id))}
	# sem linha no Mode (User novo ou conta anonimizada): os defaults de quem nunca jogou
	return UserStats(**{mode.value: PlayerStatsOut.model_validate(rows[mode]) if mode in rows
		else PlayerStatsOut() for mode in Mode})


async def match_history(session: AsyncSession, user_id: int, page: int, per_page: int,
		mode: Mode | None) -> MatchHistoryPage:
	"""Os Matches terminados do User, do mais recente para o mais antigo (matches-api.md §2.3)."""
	await _ensure_user(session, user_id)
	where = [MatchPlayer.user_id == user_id, Match.status == "finished"]
	if mode is not None:
		where.append(Match.mode == mode)
	total = await session.scalar(select(func.count())
		.select_from(MatchPlayer).join(Match, Match.id == MatchPlayer.match_id).where(*where))
	rows = (await session.execute(select(Match, MatchPlayer)
		.join(MatchPlayer, MatchPlayer.match_id == Match.id).where(*where)
		.order_by(Match.ended_at.desc(), Match.id.desc())
		.limit(per_page).offset((page - 1) * per_page))).all()

	# os outros Players da página inteira numa consulta só, e não uma por Match
	others: dict[int, list[HistoryOther]] = defaultdict(list)
	if rows:
		for match_id, other_id, won, username, avatar_url in await session.execute(
				select(MatchPlayer.match_id, MatchPlayer.user_id, MatchPlayer.won, User.username,
					User.avatar_url)
				.join(User, User.id == MatchPlayer.user_id)
				.where(MatchPlayer.match_id.in_([match.id for match, _ in rows]),
					MatchPlayer.user_id != user_id)
				.order_by(MatchPlayer.user_id)):
			others[match_id].append(HistoryOther(user_id=other_id, username=username,
				avatar_url=avatar_url or DEFAULT_AVATAR_URL, won=won))

	items = [MatchHistoryItem(match_id=match.id, mode=match.mode, map=match.map,
		ended_at=match.ended_at, duration_s=match.duration_ticks // TICK_RATE,
		# won não expressa empate: no draw do pvp, os dois têm won = false (decisão 4)
		result="draw" if match.result == "draw" else "win" if me.won else "loss",
		reason=match.reason, me=HistoryMe.model_validate(me), others=others[match.id])
		for match, me in rows]
	return MatchHistoryPage(items=items, page=page, per_page=per_page, total=total)
