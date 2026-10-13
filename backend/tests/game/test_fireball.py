# backend/tests/game/test_fireball.py
import math

import pytest

from app.game.rules import FIREBALL_COOLDOWN_S, RULESET_NUMBERS, TICK_RATE
from app.game.sim import create_room, enqueue, step
from app.game.snapshot import to_snapshot
from app.game.state import (Action, ActionKind, Input, Mode, ProjectileKind, ProjectileState,
	RoomOptions)
from app.game.world import parse_map

DT = 1 / TICK_RATE
COOLDOWN_TICKS = round(FIREBALL_COOLDOWN_S * TICK_RATE) # 12 Ticks
# o Player 7 nasce em (1, 2) e o 9 em (3, 2), com chão livre ao norte dos dois
MAP_TEXT = "11111\n10001\n1S0N1\n10001\n11111\n"
NO_KEYS = dict.fromkeys(("up", "down", "left", "right", "rot_left", "rot_right", "sprint"), False)


def new_room(mode=Mode.COOP):
	game_map = parse_map(MAP_TEXT, "t", mode)
	return create_room(12, mode, game_map, RoomOptions(), [(7, "roberto"), (9, "augusto")], seed=1)


def next_seq(room, user_id):
	return room.players[user_id].last_queued_seq + 1


def fire(room, user_id=7):
	# o Player aperta o fire; devolve os Events do Tick
	enqueue(room, user_id, Action(seq=next_seq(room, user_id), kind=ActionKind.FIRE))
	return step(room, DT)


def test_fire_creates_a_fireball_at_the_player_with_its_owner():
	room = new_room()
	player = room.players[7]
	player.angle = 0.0 # norte
	events = fire(room)
	[shot] = room.projectiles
	assert (shot.kind, shot.owner_id) == (ProjectileKind.FIREBALL, 7)
	assert (shot.x, shot.y) == (player.x, player.y)
	assert (shot.dx, shot.dy) == (0.0, -1.0)
	assert shot.state == ProjectileState.MOVING
	assert events == [] # o disparo não tem Event: o cliente vê a fireball no Snapshot


@pytest.mark.parametrize("angle, direction", [
	(0.0, (0.0, -1.0)), # norte
	(math.pi / 2, (1.0, 0.0)), # leste
	(math.pi, (0.0, 1.0)), # sul
	(-math.pi / 2, (-1.0, 0.0)), # oeste
])
def test_fireball_goes_where_the_player_looks(angle, direction):
	room = new_room()
	room.players[7].angle = angle
	fire(room)
	[shot] = room.projectiles
	assert (shot.dx, shot.dy) == pytest.approx(direction, abs=1e-12)


def test_fireball_shows_in_the_snapshot():
	room = new_room()
	player = room.players[7]
	player.angle = 0.0
	fire(room)
	assert to_snapshot(room)["projectiles"] == [{
		"id": "f_1", "kind": "fireball", "owner": 7,
		"x": player.x, "y": player.y, "dx": 0.0, "dy": -1.0, "state": "moving",
	}]


def test_fire_leaves_from_where_the_player_was_at_that_point_of_the_queue():
	# o fire entra na fila antes do Input: a fireball sai da posição de antes do passo
	room = new_room()
	player = room.players[7]
	player.angle = 0.0
	start = (player.x, player.y)
	enqueue(room, 7, Action(seq=1, kind=ActionKind.FIRE))
	enqueue(room, 7, Input(seq=2, mouse_dx=0.0, **{**NO_KEYS, "up": True}))
	step(room, DT)
	[shot] = room.projectiles
	assert (shot.x, shot.y) == start
	assert player.y < start[1] # o Player andou no mesmo Tick


@pytest.mark.parametrize("mode", [Mode.COOP, Mode.PVP])
def test_fire_spends_the_mana_cost_of_the_ruleset(mode):
	numbers = RULESET_NUMBERS[mode]
	room = new_room(mode)
	fire(room)
	# a regeneração do Tick vem depois da Action
	left = numbers["MANA_MAX"] - numbers["FIREBALL_MANA_COST"] + numbers["MANA_REGEN_PER_S"] * DT
	assert room.players[7].mana == pytest.approx(left)


@pytest.mark.parametrize("mode", [Mode.COOP, Mode.PVP])
def test_without_mana_nothing_happens(mode):
	numbers = RULESET_NUMBERS[mode]
	room = new_room(mode)
	room.players[7].mana = numbers["FIREBALL_MANA_COST"] - 0.5
	assert fire(room) == []
	assert room.projectiles == []
	assert room.players[7].mana >= numbers["FIREBALL_MANA_COST"] - 0.5 # nada foi gasto


def test_in_cooldown_nothing_happens():
	room = new_room()
	fire(room)
	mana = room.players[7].mana
	fire(room)
	assert len(room.projectiles) == 1
	assert room.players[7].mana > mana # o segundo fire não gastou Mana


def test_cooldown_lasts_exactly_fireball_cooldown_s():
	room = new_room()
	fire(room) # Tick 1
	for _ in range(COOLDOWN_TICKS - 1):
		fire(room) # Ticks 2 a 12: em cooldown
	assert len(room.projectiles) == 1
	fire(room) # Tick 13: 0,4 s depois do primeiro
	assert len(room.projectiles) == 2


def test_cooldown_is_per_player():
	room = new_room()
	fire(room, 7)
	fire(room, 9)
	assert [shot.owner_id for shot in room.projectiles] == [7, 9]


def test_dead_player_does_not_fire_nor_regenerate():
	room = new_room()
	room.players[7].alive = False
	room.players[7].mana = 50.0
	assert fire(room) == []
	assert room.projectiles == []
	assert room.players[7].mana == 50.0


def test_mana_starts_full_and_stops_at_the_ceiling():
	room = new_room()
	mana_max = RULESET_NUMBERS[Mode.COOP]["MANA_MAX"]
	assert room.players[7].mana == mana_max
	step(room, DT)
	assert room.players[7].mana == mana_max
	room.players[7].mana = mana_max - 0.1 # menos que a regeneração de um Tick
	step(room, DT)
	assert room.players[7].mana == mana_max


@pytest.mark.parametrize("mode", [Mode.COOP, Mode.PVP])
def test_mana_regenerates_mana_regen_per_s(mode):
	# sem Input nenhum: a regeneração é do Tick
	room = new_room(mode)
	room.players[7].mana = 0.0
	for _ in range(TICK_RATE):
		step(room, DT)
	assert room.players[7].mana == pytest.approx(RULESET_NUMBERS[mode]["MANA_REGEN_PER_S"])


def test_catch_up_does_not_regenerate_twice():
	# com 3 Inputs na fila o Tick aplica 2, e a Mana sobe o mesmo que a de quem não mandou nada
	room = new_room()
	for player in room.players.values():
		player.mana = 0.0
	for seq in (1, 2, 3):
		enqueue(room, 7, Input(seq=seq, mouse_dx=0.0, **NO_KEYS))
	step(room, DT)
	assert room.players[7].last_input_seq == 2
	assert room.players[7].mana == room.players[9].mana > 0.0


def test_snapshot_floors_the_mana_and_fire_uses_the_exact_value():
	room = new_room()
	cost = RULESET_NUMBERS[Mode.COOP]["FIREBALL_MANA_COST"]
	room.players[7].mana = cost - 0.5
	[shown, _] = to_snapshot(room)["players"]
	assert shown["mana"] == cost - 1
	fire(room)
	assert room.projectiles == [] # 9.5 não paga uma fireball de 10
	room.players[7].mana = float(cost)
	fire(room)
	assert len(room.projectiles) == 1


def test_two_players_firing_in_the_same_tick_get_different_ids():
	room = new_room()
	enqueue(room, 7, Action(seq=1, kind=ActionKind.FIRE))
	enqueue(room, 9, Action(seq=1, kind=ActionKind.FIRE))
	step(room, DT)
	assert [(shot.id, shot.owner_id) for shot in room.projectiles] == [("f_1", 7), ("f_2", 9)]


def test_projectile_id_is_never_reused():
	room = new_room()
	fire(room, 7)
	room.projectiles.clear() # a fireball saiu da Room
	fire(room, 9)
	assert [shot.id for shot in room.projectiles] == ["f_2"]
