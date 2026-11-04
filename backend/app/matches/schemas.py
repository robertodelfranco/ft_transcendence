"""Corpo do POST /api/matches (matches-api.md §2.2, room-options.md §2.1) e o MatchDetail (§2.4)."""
from datetime import datetime
from typing import Annotated, Any, Literal

from fastapi import Path
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.core.errors import ApiError, validation_fields
from app.game.state import Mode, PickupOptions, RoomOptions
from app.matches.models import Reason, Result


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
