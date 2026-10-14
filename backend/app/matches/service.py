"""Catálogo de Maps e criação de Match (matches-api.md §2.2, rooms.md §2.2)."""
from dataclasses import dataclass
from pathlib import Path

from fastapi import Request
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.auth.schemas import DEFAULT_AVATAR_URL
from app.core.errors import ApiError
from app.game import Mode, load_map
from app.game.protocol import options_payload
from app.game.rooms import MAX_PLAYERS, MIN_PLAYERS, RoomInfo, RoomManager, now
from app.game.world import MAPS_DIR
from app.matches.models import Match
from app.matches.schemas import CreateMatchIn, parse_options


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

async def create_match(session: AsyncSession, rooms: RoomManager, catalog: Catalog,
		user: User, body: CreateMatchIn) -> RoomInfo:
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
	return info


# ---------- sair e iniciar ----------

async def leave_match(session: AsyncSession, rooms: RoomManager, match_id: int, user_id: int) -> None:
	"""O último a sair grava aborted; o host que sai passa o created_by adiante (rooms.md decisão 3).

	A Room muda antes do banco e sem await: ninguém entra entre a saída e a gravação.
	"""
	info = rooms.leave(match_id, user_id)
	values = {"status": "aborted"} if info is None else {"created_by": info.created_by}
	await session.execute(update(Match).where(Match.id == match_id).values(**values))
	await session.commit()


async def start_match(session: AsyncSession, rooms: RoomManager, match_id: int, user_id: int) -> None:
	if rooms.info(match_id).created_by != user_id:
		raise ApiError(403, "not_host", f"user {user_id} is not the host of match {match_id}")
	rooms.start(match_id) # AlreadyStarted no segundo clique: uma task de tick só
	# ponytail: se este commit falhar, a Room roda com o banco em lobby e o record_match_result
	# não acha a linha 'running'; o startup da F5.3 pode abortar o que sobrar em lobby
	await session.execute(update(Match).where(Match.id == match_id)
		.values(status="running", started_at=now()))
	await session.commit()
