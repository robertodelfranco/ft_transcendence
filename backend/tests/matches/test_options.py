# backend/tests/matches/test_options.py
# Normalização das options (matches-api.md §2.2, room-options.md §2.1 e §5.3).
import pytest

from app.core.errors import ApiError
from app.game.state import Mode, PickupOptions, RoomOptions
from app.matches.schemas import OPTIONS_BY_MODE, CreateMatchIn, parse_options


def fields_of(mode: Mode, raw: dict) -> dict[str, str]:
	with pytest.raises(ApiError) as refused:
		parse_options(mode, raw)
	assert (refused.value.status_code, refused.value.code) == (422, "invalid_options")
	return refused.value.fields


@pytest.mark.parametrize("mode", list(Mode))
def test_empty_options_are_the_simulation_defaults(mode):
	assert parse_options(mode, {}) == RoomOptions()


def test_models_and_dataclass_agree_on_every_default():
	# a dataclass é a fonte; se alguém mudar o default lá, o modelo da API acompanha
	for model in OPTIONS_BY_MODE.values():
		for name, field in model.model_fields.items():
			expected = getattr(RoomOptions(), name)
			default = field.get_default(call_default_factory=True)
			if name == "pickups":
				default = PickupOptions(**default.model_dump())
			assert default == expected, name


def test_partial_pickups_get_the_default_per_key():
	options = parse_options(Mode.COOP, {"pickups": {"armor": False}})
	assert options.pickups == PickupOptions(potion=True, mana=True, armor=False)


def test_explicit_values_are_kept():
	options = parse_options(Mode.PVP, {"theme": "sewer", "start_hp": 15, "frag_limit": 7,
		"time_limit_s": 300})
	assert (options.theme, options.start_hp, options.frag_limit, options.time_limit_s) == ("sewer", 15, 7, 300)


@pytest.mark.parametrize("mode, key, low, high", [
	(Mode.COOP, "start_hp", 5, 20),
	(Mode.PVP, "frag_limit", 3, 10),
	(Mode.PVP, "time_limit_s", 120, 600),
])
def test_limits_are_inclusive(mode, key, low, high):
	assert getattr(parse_options(mode, {key: low}), key) == low
	assert getattr(parse_options(mode, {key: high}), key) == high
	assert fields_of(mode, {key: low - 1}) == {key: "invalid_value"}
	assert fields_of(mode, {key: high + 1}) == {key: "invalid_value"}


@pytest.mark.parametrize("raw, expected", [
	({"frag_limit": 5}, {"frag_limit": "invalid_value"}), # opção de pvp no coop
	({"time_limit_s": 180}, {"time_limit_s": "invalid_value"}),
	({"enemy_density": 3}, {"enemy_density": "invalid_value"}), # campo desconhecido
	({"start_hp": "10"}, {"start_hp": "invalid_value"}), # strict: sem coerção
	({"start_hp": None}, {"start_hp": "invalid_value"}),
	({"start_hp": 10.0}, {"start_hp": "invalid_value"}),
	({"theme": "lava"}, {"theme": "invalid_value"}),
	({"pickups": {"potion": "true"}}, {"pickups.potion": "invalid_value"}),
	({"pickups": {"key": False}}, {"pickups.key": "invalid_value"}), # chave não é configurável
	({"pickups": None}, {"pickups": "invalid_value"}),
])
def test_coop_refuses_what_the_contract_refuses(raw, expected):
	assert fields_of(Mode.COOP, raw) == expected


def test_pvp_accepts_what_coop_refuses():
	assert parse_options(Mode.PVP, {"frag_limit": 5}).frag_limit == 5


def test_create_body_needs_only_mode_and_map():
	body = CreateMatchIn.model_validate({"mode": "coop", "map": "dungeon_map"})
	assert (body.max_players, body.options) == (None, {})


@pytest.mark.parametrize("body", [
	{"mode": "coop"}, # sem map
	{"mode": "arena", "map": "dungeon_map"},
	{"mode": "coop", "map": "../etc/passwd"}, # o nome nunca sai da pasta dos mapas
	{"mode": "coop", "map": "Dungeon"},
	{"mode": "coop", "map": "dungeon_map", "room_id": 1},
])
def test_create_body_refuses_bad_input(body):
	from pydantic import ValidationError
	with pytest.raises(ValidationError):
		CreateMatchIn.model_validate(body)
