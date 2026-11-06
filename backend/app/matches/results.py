"""Fim de Match no banco (rooms.md §2.5 e §2.6): o que a Room grava ao terminar e o que o startup aborta.

Separado do service.py, que importa app.game.rooms: a Room importa daqui (F2.9) sem ciclo de import.
Roda fora de request, então recebe a fábrica de sessões (`sessions`), como o authenticate_ws_token.
"""
import logging
from collections.abc import Callable
from dataclasses import asdict, dataclass
from datetime import datetime

from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import SessionLocal
from app.game import TICK_RATE, MatchOutcome, Mode
from app.matches.models import Match, MatchPlayer, PlayerStats
from app.matches.progression import elo_delta, level_for, xp_gained


log = logging.getLogger(__name__)


@dataclass(frozen=True)
class AchievementUnlock:
	user_id: int
	code: str


async def record_match_result(match_id: int, outcome: MatchOutcome, ended_at: datetime, *,
		sessions: Callable[[], AsyncSession] = SessionLocal) -> list[AchievementUnlock]:
	"""Grava o Match terminado uma vez só; a Room emite `achievement_unlocked` com o que voltar.

	A chave de idempotência é a linha em 'running', travada até o commit (rooms.md decisão 5):
	a segunda chamada, ou a que chega depois de um abort, não acha a linha e devolve [].
	"""
	async with sessions() as session:
		match = await session.scalar(select(Match)
			.where(Match.id == match_id, Match.status == "running").with_for_update())
		if match is None:
			# repetida, abortada ou o commit do start falhou (o banco ficou em lobby)
			log.warning("match result ignored", extra={"match_id": match_id})
			return []
		mode, draw = Mode(match.mode), outcome.result == "draw"
		stats = await _locked_stats(session, mode, [player.user_id for player in outcome.players])
		elo_after = _new_elos(match_id, mode, outcome, stats)
		for player in outcome.players:
			row, xp = stats[player.user_id], xp_gained(mode, player, draw)
			# elo_before é lido antes de a linha mudar; fora do pvp os dois ficam NULL
			session.add(MatchPlayer(match_id=match_id, **asdict(player), xp_gained=xp,
				elo_before=row.elo if player.user_id in elo_after else None,
				elo_after=elo_after.get(player.user_id)))
			row.matches_played += 1
			row.wins += int(player.won)
			row.draws += int(draw)
			row.losses += int(not player.won and not draw)
			row.kills += player.kills
			row.frags += player.frags
			row.deaths += player.deaths
			row.playtime_s += outcome.duration_ticks // TICK_RATE
			row.xp += xp
			row.level = level_for(row.xp)
			row.elo = elo_after.get(player.user_id, row.elo)
			row.updated_at = func.now()
		# conquistas (F5.7) entram aqui, na mesma transação
		match.status = "finished"
		match.result = outcome.result
		match.reason = outcome.reason
		match.ended_at = ended_at
		match.duration_ticks = outcome.duration_ticks
		await session.commit()
	return []


async def _locked_stats(session: AsyncSession, mode: Mode, user_ids: list[int]) -> dict[int, PlayerStats]:
	"""As linhas de player_stats dos Players, criadas se faltarem e travadas até o commit."""
	await session.execute(insert(PlayerStats)
		.values([{"user_id": user_id, "mode": mode} for user_id in user_ids]).on_conflict_do_nothing())
	# populate_existing: o valor que vale é o da linha travada, não o que a sessão já tinha
	rows = await session.scalars(select(PlayerStats)
		.where(PlayerStats.mode == mode, PlayerStats.user_id.in_(user_ids))
		.with_for_update().execution_options(populate_existing=True))
	return {row.user_id: row for row in rows}


def _new_elos(match_id: int, mode: Mode, outcome: MatchOutcome,
		stats: dict[int, PlayerStats]) -> dict[int, int]:
	"""O Elo depois do Match, por user_id; vazio fora do pvp 1v1 (progression.md §7)."""
	if mode != Mode.PVP:
		return {}
	if len(outcome.players) != 2:
		log.warning("pvp result without two players, elo kept", extra={"match_id": match_id})
		return {}
	# A é o menor user_id, para o cálculo não depender da ordem dos Players
	a, b = sorted(outcome.players, key=lambda player: player.user_id)
	score_a = 1 if a.won else 0.5 if outcome.result == "draw" else 0
	rating_a, rating_b = stats[a.user_id].elo, stats[b.user_id].elo
	delta = elo_delta(rating_a, rating_b, score_a)
	return {a.user_id: rating_a + delta, b.user_id: rating_b - delta}


async def abort_unfinished(match_id: int | None = None, *,
		sessions: Callable[[], AsyncSession] = SessionLocal) -> int:
	"""lobby e running viram aborted com server_shutdown; devolve quantos Matches mudaram.

	Sem match_id é o startup: o RoomManager de um processo novo nasce vazio, então toda linha
	aberta é órfã. Com match_id é a Room que a Simulation derrubou (`_abort`). finished não muda.
	"""
	query = (update(Match).where(Match.status.in_(("lobby", "running")))
		.values(status="aborted", reason="server_shutdown"))
	if match_id is not None:
		query = query.where(Match.id == match_id)
	async with sessions() as session:
		aborted = (await session.execute(query)).rowcount
		await session.commit()
	return aborted
