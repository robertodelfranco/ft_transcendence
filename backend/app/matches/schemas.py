"""Corpo do POST /api/matches (matches-api.md §2.2, room-options.md §2.1)."""
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.core.errors import ApiError, validation_fields
from app.game.state import Mode, PickupOptions, RoomOptions


# os defaults saem da Simulation (fonte única); aqui só entram os limites
_DEFAULT = RoomOptions()

MapName = Annotated[str, Field(pattern=r"^[a-z0-9_]+$")]


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
