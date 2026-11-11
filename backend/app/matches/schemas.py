"""Corpo do POST /api/matches (matches-api.md §2.2, room-options.md §2.1), PlayerStats, conquistas, histórico e leaderboard (§2.3) e MatchDetail (§2.4)."""
from datetime import datetime
from typing import Annotated, Any, Literal

from fastapi import Path, Query
from pydantic import BaseModel, ConfigDict, Field, ValidationError, computed_field

from app.core.errors import ApiError, validation_fields
from app.game.state import Mode, PickupOptions, RoomOptions
from app.matches.models import Reason, Result
from app.matches.progression import ELO_START, threshold


# os defaults saem da Simulation (fonte única); aqui só entram os limites
_DEFAULT = RoomOptions()

MapName = Annotated[str, Field(pattern=r"^[a-z0-9_]+$")]
# o id é BIGINT no Postgres: acima disso o asyncpg recusa o parâmetro, e a rota daria 500
MatchId = Annotated[int, Path(ge=1, le=2**63 - 1)]


class Input(BaseModel):
	# strict: "10" não vira 10; forbid: campo desconhecido é 422, não é ignorado
	model_config = ConfigDict(strict=True, extra="forbid")


class PickupsIn(Input):
	potion: bool = _DEFAULT.pickups.potion
	mana: bool = _DEFAULT.pickups.mana
	armor: bool = _DEFAULT.pickups.armor


class CoopOptionsIn(Input):
	theme: Literal["dungeon", "sewer"] = _DEFAULT.theme
	start_hp: int = Field(_DEFAULT.start_hp, ge=5, le=20)
	pickups: PickupsIn = PickupsIn()


class PvpOptionsIn(CoopOptionsIn):
	frag_limit: int = Field(_DEFAULT.frag_limit, ge=3, le=10)
	time_limit_s: int = Field(_DEFAULT.time_limit_s, ge=120, le=600)


OPTIONS_BY_MODE = {Mode.COOP: CoopOptionsIn, Mode.PVP: PvpOptionsIn}


class CreateMatchIn(Input):
	# strict=False só aqui: no modo estrito o enum recusaria o texto "coop" que vem do JSON
	mode: Mode = Field(strict=False)
	map: MapName
	max_players: int | None = None # None: o teto do Map, resolvido na rota
	options: dict[str, Any] = {} # validado por parse_options, que depende do mode


def parse_options(mode: Mode, raw: dict[str, Any]) -> RoomOptions:
	"""422 invalid_options com `fields`; devolve a dataclass da Simulation."""
	try:
		parsed = OPTIONS_BY_MODE[mode].model_validate(raw)
	except ValidationError as error:
		raise ApiError(422, "invalid_options", "invalid options",
			validation_fields(error.errors())) from None
	values = parsed.model_dump()
	values["pickups"] = PickupOptions(**values["pickups"])
	return RoomOptions(**values) # no coop, o que não veio fica no default da dataclass


class ReadyIn(Input):
	ready: bool


# ---------- MatchDetail (matches-api.md §2.4) ----------

class MatchPlayerRow(BaseModel):
	user_id: int
	username: str
	avatar_url: str
	won: bool
	survived: bool
	disconnected_at_end: bool
	kills: int
	frags: int
	deaths: int
	damage_dealt: int
	damage_taken: int
	armor_absorbed: int
	keys_collected: int
	potions_used: int
	xp_gained: int
	elo_before: int | None # só no pvp
	elo_after: int | None


class MatchDetail(BaseModel):
	match_id: int
	created_by: int
	mode: Mode
	map: str
	status: Literal["finished"] # lobby, running e aborted são 409
	options: dict[str, Any] # as RoomOptions normalizadas, como gravadas no create
	started_at: datetime
	ended_at: datetime
	duration_s: int # já convertido de Ticks: a tela não conhece o TICK_RATE (decisão 5)
	result: Result # desfecho da Room; quem ganhou é players[].won (decisão 4)
	reason: Reason
	players: list[MatchPlayerRow] # em ordem de user_id


# ---------- estatísticas (matches-api.md §2.3) ----------

class PlayerStatsOut(BaseModel):
	"""Uma linha de player_stats; os defaults são os de quem nunca jogou o Mode (sem linha)."""
	model_config = ConfigDict(from_attributes=True)

	matches_played: int = 0
	wins: int = 0
	losses: int = 0
	draws: int = 0
	kills: int = 0
	frags: int = 0
	deaths: int = 0
	playtime_s: int = 0
	xp: int = 0
	level: int = 1
	elo: int = ELO_START

	# calculados na resposta: a tela não divide nem conhece a fórmula de level (decisão 5)
	@computed_field
	@property
	def win_rate(self) -> float:
		return round(self.wins / self.matches_played, 3) if self.matches_played else 0

	@computed_field
	@property
	def xp_to_next_level(self) -> int:
		return threshold(self.level + 1) - self.xp

	@computed_field
	@property
	def xp_level_start(self) -> int:
		# onde a barra do level atual começa (progression.md §6)
		return threshold(self.level)


class UserStats(BaseModel):
	coop: PlayerStatsOut
	pvp: PlayerStatsOut


# ---------- conquistas (matches-api.md §2.3) ----------

class AchievementUnlocked(BaseModel):
	model_config = ConfigDict(from_attributes=True)

	code: str
	unlocked_at: datetime
	match_id: int | None # o Match do primeiro desbloqueio; null se ele não existir mais


class AchievementInfo(BaseModel):
	code: str
	mode: Mode | None # null: vale nos dois Modes


class UserAchievements(BaseModel):
	unlocked: list[AchievementUnlocked] # do mais recente para o mais antigo
	catalog: list[AchievementInfo] # na ordem do progression.md §3


# ---------- histórico (matches-api.md §2.3) ----------

# sem teto, um page enorme vira um OFFSET além do BIGINT: o asyncpg recusa e a rota daria 500
Page = Annotated[int, Query(ge=1, le=10_000)]
PerPage = Annotated[int, Query(ge=1, le=50)]


class HistoryMe(BaseModel):
	"""A linha de match_players do User da rota, só com o que a tela mostra."""
	model_config = ConfigDict(from_attributes=True)

	kills: int
	frags: int
	deaths: int
	damage_dealt: int
	damage_taken: int
	xp_gained: int
	elo_before: int | None # só no pvp
	elo_after: int | None


class HistoryOther(BaseModel):
	user_id: int
	username: str
	avatar_url: str
	won: bool


class MatchHistoryItem(BaseModel):
	match_id: int
	mode: Mode
	map: str
	ended_at: datetime
	duration_s: int
	result: Result # do ponto de vista do user_id da rota (decisão 4)
	reason: Reason
	me: HistoryMe
	others: list[HistoryOther] # em ordem de user_id


class MatchHistoryPage(BaseModel):
	items: list[MatchHistoryItem]
	page: int
	per_page: int
	total: int


# ---------- leaderboard (matches-api.md §2.3) ----------

LeaderboardMetric = Literal["elo", "xp", "wins", "kills"]
Limit = Annotated[int, Query(ge=1, le=100)]


class LeaderboardRow(BaseModel):
	rank: int # sequencial a partir de 1: o servidor já desempatou
	user_id: int
	username: str
	avatar_url: str
	value: int # o valor da metric pedida


class Leaderboard(BaseModel):
	items: list[LeaderboardRow]
