"""Fim de Match no banco (rooms.md §2.5 e §2.6): o que a Room grava ao terminar e o que o startup aborta.

Separado do service.py, que importa app.game.rooms: a Room importa daqui (F2.9) sem ciclo de import.
Roda fora de request, então recebe a fábrica de sessões (`sessions`), como o authenticate_ws_token.
"""
import logging
from collections.abc import Callable
from dataclasses import asdict, dataclass
from datetime import datetime

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import SessionLocal
from app.game import MatchOutcome
from app.matches.models import Match, MatchPlayer


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
		# os campos do PlayerOutcome são colunas de match_players; xp_gained e elo_* ficam no default
		session.add_all(MatchPlayer(match_id=match_id, **asdict(player)) for player in outcome.players)
		# player_stats (F5.4), Elo e XP (F5.5) e conquistas (F5.7) entram aqui, na mesma transação
		match.status = "finished"
		match.result = outcome.result
		match.reason = outcome.reason
		match.ended_at = ended_at
		match.duration_ticks = outcome.duration_ticks
		await session.commit()
	return []


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
