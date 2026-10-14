from datetime import datetime
from typing import Annotated, Any, Literal, get_args

from sqlalchemy import BigInteger, CheckConstraint, ForeignKey, Index, SmallInteger, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, BigIntPK, CreatedAt, UserFK, in_values
from app.game.state import Mode


# tabelas de rooms.md §2.7; os estados seguem o ciclo de vida do Match (§2.6)
Status = Literal["lobby", "running", "finished", "aborted"]
Result = Literal["win", "loss", "draw"]
# server_shutdown não vem do MatchResult: só o startup grava (§2.4)
Reason = Literal["boss_defeated", "all_dead", "frag_limit", "time_limit", "forfeit", "server_shutdown"]

STATUSES: tuple[Status, ...] = get_args(Status)
RESULTS: tuple[Result, ...] = get_args(Result)
REASONS: tuple[Reason, ...] = get_args(Reason)

# quem tem partida no histórico não pode ser apagado (rooms.md §5, item 8)
UserRestrictFK = Annotated[int, mapped_column(BigInteger, ForeignKey("users.id", ondelete="RESTRICT"))]
Counter = Annotated[int, mapped_column(server_default="0")]


class Match(Base):
	__tablename__ = "matches"
	__table_args__ = (
		CheckConstraint(in_values("mode", Mode), name="mode"),
		CheckConstraint(in_values("status", STATUSES), name="status"),
		# NULL passa no CHECK: result e reason ficam vazios até o fim
		CheckConstraint(in_values("result", RESULTS), name="result"),
		CheckConstraint(in_values("reason", REASONS), name="reason"),
	)

	id: Mapped[BigIntPK] # é o match_id
	mode: Mapped[str]
	map: Mapped[str] # nome do arquivo, sem extensão e sem pasta
	max_players: Mapped[int] = mapped_column(SmallInteger)
	options: Mapped[dict[str, Any]] = mapped_column(JSONB) # RoomOptions já com os defaults
	status: Mapped[Status] = mapped_column(server_default="lobby")
	created_by: Mapped[UserRestrictFK] # o host; muda quando ele sai do Lobby (decisão 3)
	created_at: Mapped[CreatedAt]
	started_at: Mapped[datetime | None]
	ended_at: Mapped[datetime | None]
	duration_ticks: Mapped[int | None]
	result: Mapped[Result | None] # desfecho da Room; quem ganhou é match_players.won (decisão 1)
	reason: Mapped[Reason | None]


class MatchPlayer(Base):
	__tablename__ = "match_players"

	# a PK (match_id, user_id) é o que torna o INSERT do record_match_result idempotente
	match_id: Mapped[int] = mapped_column(
		BigInteger, ForeignKey("matches.id", ondelete="CASCADE"), primary_key=True)
	user_id: Mapped[UserRestrictFK] = mapped_column(primary_key=True)
	won: Mapped[bool]
	survived: Mapped[bool]
	disconnected_at_end: Mapped[bool]
	kills: Mapped[Counter]
	frags: Mapped[Counter]
	deaths: Mapped[Counter]
	damage_dealt: Mapped[Counter]
	damage_taken: Mapped[Counter]
	armor_absorbed: Mapped[Counter]
	keys_collected: Mapped[Counter]
	potions_used: Mapped[Counter]
	xp_gained: Mapped[Counter]
	elo_before: Mapped[int | None] # só no pvp
	elo_after: Mapped[int | None]


class PlayerStats(Base):
	"""Agregado por (User, Mode), atualizado só pelo record_match_result (decisão 6)."""

	__tablename__ = "player_stats"
	__table_args__ = (CheckConstraint(in_values("mode", Mode), name="mode"),)

	user_id: Mapped[UserFK] = mapped_column(primary_key=True)
	mode: Mapped[str] = mapped_column(primary_key=True)
	matches_played: Mapped[Counter]
	wins: Mapped[Counter]
	losses: Mapped[Counter]
	draws: Mapped[Counter]
	kills: Mapped[Counter]
	frags: Mapped[Counter]
	deaths: Mapped[Counter]
	playtime_s: Mapped[Counter]
	xp: Mapped[Counter]
	elo: Mapped[int] = mapped_column(server_default="1000") # só muda no pvp (decisão 7)
	level: Mapped[int] = mapped_column(server_default="1") # derivado de xp (F4.6)
	updated_at: Mapped[datetime] = mapped_column(server_default=func.now())


class UserAchievement(Base):
	"""Só o desbloqueio: o catálogo de conquistas vive no código (F4.6)."""

	__tablename__ = "user_achievements"

	# a PK (user_id, code) faz o desbloqueio repetido virar ON CONFLICT DO NOTHING
	user_id: Mapped[UserFK] = mapped_column(primary_key=True)
	code: Mapped[str] = mapped_column(primary_key=True)
	unlocked_at: Mapped[datetime] = mapped_column(server_default=func.now())
	match_id: Mapped[int | None] = mapped_column(
		BigInteger, ForeignKey("matches.id", ondelete="SET NULL"))


# fora da classe porque o DESC precisa da coluna pronta; nomes do contrato (§2.7)
Index("ix_matches_status_created", Match.status, Match.created_at.desc())
Index("ix_match_players_user", MatchPlayer.user_id, MatchPlayer.match_id.desc())
Index("ix_player_stats_elo", PlayerStats.mode, PlayerStats.elo.desc())
Index("ix_player_stats_xp", PlayerStats.mode, PlayerStats.xp.desc())
