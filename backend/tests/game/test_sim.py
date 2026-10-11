# backend/tests/game/test_sim.py
import math
from random import Random

import pytest

from app.game.rules import BOSS_HP, RULESET_NUMBERS
from app.game.sim import create_room
from app.game.state import BossState, EnemyState, Mode, RoomOptions
from app.game.world import parse_map

# 3 Spawns (N, E, S), uma chave, uma Door, um Enemy e o Boss
MAP_TEXT = "1111111\n1N0E0S1\n1K0D0I1\n10000B1\n1111111\n"
PLAYERS = [(7, "roberto"), (9, "augusto")]


def new_room(players=PLAYERS, options=RoomOptions(), seed=1):
	game_map = parse_map(MAP_TEXT, "t", Mode.COOP)
	return create_room(12, Mode.COOP, game_map, options, players, seed)


def test_nth_player_is_born_on_the_nth_spawn():
	room = new_room()
	assert list(room.players) == [7, 9]
	assert (room.players[7].x, room.players[7].y) == (1.5, 1.5)
	assert (room.players[9].x, room.players[9].y) == (3.5, 1.5)


def test_spawn_direction_becomes_the_angle():
	room = new_room()
	assert room.players[7].angle == pytest.approx(0.0) # N
	assert room.players[9].angle == pytest.approx(math.pi / 2) # E


def test_player_starts_full_and_disconnected():
	player = new_room(options=RoomOptions(start_hp=7)).players[7]
	assert player.name == "roberto"
	assert player.hp == 7
	assert player.mana == RULESET_NUMBERS[Mode.COOP]["MANA_MAX"]
	assert player.alive and not player.connected


def test_entities_come_from_the_map():
	room = new_room()
	assert [(e.id, e.x, e.y, e.state) for e in room.enemies] == [("e_1", 5.5, 2.5, EnemyState.ALERT)]
	assert (room.boss.x, room.boss.y, room.boss.hp, room.boss.state) == (5.5, 3.5, BOSS_HP, BossState.IDLE)
	assert [(d.x, d.y, d.locked, d.open) for d in room.doors] == [(3, 2, True, False)]


def test_room_starts_at_tick_zero_with_its_own_grid():
	room = new_room()
	assert room.tick == 0 and room.result is None
	assert room.numbers == RULESET_NUMBERS[Mode.COOP]
	room.grid[2][1] = "0" # como se a chave tivesse sido coletada
	assert room.initial_grid[2][1] == "K"
	assert new_room().grid[2][1] == "K"


def test_seed_feeds_the_room_rng():
	assert new_room(seed=42).rng.random() == Random(42).random()


def test_more_players_than_spawns_is_refused():
	with pytest.raises(ValueError):
		new_room(players=[(1, "a"), (2, "b"), (3, "c"), (4, "d")])
