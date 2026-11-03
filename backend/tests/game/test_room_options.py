import pytest

from app.game.rules import POTION_HEAL, TICK_RATE
from app.game.sim import create_room, enqueue, step
from app.game.snapshot import initial_grid, to_snapshot
from app.game.state import Input, Mode, PickupOptions, RoomOptions
from app.game.world import parse_map


COOP_MAP = "1111111\n1N000S1\n1KPMA01\n1111111\n"
PVP_MAP = "1111111\n1E000W1\n1KPMA01\n1111111\n"
PLAYERS = [(7, "roberto"), (9, "augusto")]


def room_for(mode: Mode, options: RoomOptions | None = None):
	game_map = parse_map(COOP_MAP if mode is Mode.COOP else PVP_MAP, "options", mode)
	room = create_room(12, mode, game_map, options or RoomOptions(), PLAYERS, seed=1)
	return room, game_map


def test_defaults_keep_pickups_and_keys_with_full_start_hp():
	room, game_map = room_for(Mode.COOP)
	assert room.options == RoomOptions()
	assert room.players[7].hp == 10
	assert initial_grid(room) == list(game_map.grid)
	assert room.grid[2][1:5] == list("KPMA")
	assert to_snapshot(room)["grid_delta"] == []


@pytest.mark.parametrize("kind,cell", [("potion", 2), ("mana", 3), ("armor", 4)])
def test_disabled_pickup_is_floor_in_initial_grid_without_changing_shared_map(kind, cell):
	options = RoomOptions(pickups=PickupOptions(**{kind: False}))
	room, game_map = room_for(Mode.COOP, options)
	assert room.initial_grid[2][cell] == room.grid[2][cell] == "0"
	assert room.initial_grid[2][1] == room.grid[2][1] == "K"
	assert game_map.grid[2] == "1KPMA01"
	assert to_snapshot(room)["grid_delta"] == []


@pytest.mark.parametrize("mode", [Mode.COOP, Mode.PVP])
def test_start_hp_sets_initial_hp_and_potion_ceiling(mode):
	room, _ = room_for(mode, RoomOptions(start_hp=15))
	player = room.players[7]
	assert player.hp == 15
	player.hp = 15 - POTION_HEAL + 1
	player.x, player.y = 2.5, 2.5
	enqueue(room, 7, Input(seq=1, mouse_dx=0.0, up=False, down=False, left=False,
		right=False, rot_left=False, rot_right=False, sprint=False))
	step(room, 1 / TICK_RATE)
	assert player.hp == 15


def test_pvp_frag_limit_option_ends_the_match_at_the_selected_count():
	room, _ = room_for(Mode.PVP, RoomOptions(frag_limit=3))
	room.players[7].frags = 3
	step(room, 1 / TICK_RATE)
	assert room.result == {"result": "win", "winner_ids": [7], "reason": "frag_limit"}


def test_pvp_time_limit_option_ends_at_the_selected_tick():
	room, _ = room_for(Mode.PVP, RoomOptions(time_limit_s=120))
	room.tick = 120 * TICK_RATE - 1
	assert room.result is None
	step(room, 1 / TICK_RATE)
	assert room.result == {"result": "draw", "winner_ids": [], "reason": "time_limit"}


def test_theme_does_not_change_simulation_grid():
	room, game_map = room_for(Mode.COOP, RoomOptions(theme="sewer"))
	assert initial_grid(room) == list(game_map.grid)
