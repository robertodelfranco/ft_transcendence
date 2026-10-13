# backend/tests/game/test_doors.py
import math

from app.game.rules import TICK_RATE
from app.game.sim import create_room, enqueue, step
from app.game.snapshot import to_snapshot
from app.game.state import Action, ActionKind, Event, Input, Mode, RoomOptions
from app.game.world import parse_map

DT = 1 / TICK_RATE
# o Player 7 nasce em (1, 1) olhando para o sul, de frente para a Door em (1, 2)
MAP_TEXT = "11111\n1S0N1\n1D111\n10001\n11111\n"
DOOR = (1, 2)


def new_room(map_text=MAP_TEXT, players=((7, "roberto"), (9, "augusto"))):
	game_map = parse_map(map_text, "t", Mode.COOP)
	return create_room(12, Mode.COOP, game_map, RoomOptions(), list(players), seed=1)


def next_seq(room):
	return room.players[7].last_queued_seq + 1


def press_door(room):
	# o Player 7 aperta a tecla da Door; devolve os Events do Tick
	enqueue(room, 7, Action(seq=next_seq(room), kind=ActionKind.DOOR))
	return step(room, DT)


def walk_forward(room, ticks):
	keys = dict.fromkeys(("down", "left", "right", "rot_left", "rot_right", "sprint"), False)
	for _ in range(ticks):
		enqueue(room, 7, Input(seq=next_seq(room), mouse_dx=0.0, up=True, **keys))
		step(room, DT)
	return room.players[7]


def door_char(room):
	column, row = DOOR
	return room.grid[row][column]


def test_locked_door_opens_with_a_key_of_who_pressed():
	room = new_room()
	room.players[7].keys = 1
	room.players[9].keys = 1
	events = press_door(room)
	door = room.doors[0]
	assert (door.open, door.locked) == (True, False)
	assert door_char(room) == "O"
	assert (room.players[7].keys, room.players[9].keys) == (0, 1)
	assert events == [Event("door_opened", 1, {"x": 1, "y": 2, "by": 7})]


def test_without_a_key_nothing_happens():
	room = new_room()
	assert press_door(room) == []
	assert (room.doors[0].open, room.doors[0].locked) == (False, True)
	assert door_char(room) == "D"


def test_open_door_ignores_the_action():
	room = new_room()
	room.players[7].keys = 2
	press_door(room)
	assert press_door(room) == [] # Door aberta não fecha, e não gasta outra chave
	assert room.players[7].keys == 1
	assert room.doors[0].open


def test_door_must_be_door_reach_ahead():
	# virado para o leste, a célula à frente é chão: a Door ao sul não abre
	room = new_room()
	room.players[7].keys = 1
	room.players[7].angle = math.pi / 2
	assert press_door(room) == []
	assert room.players[7].keys == 1


def test_target_outside_the_grid_does_nothing():
	# num Grid de uma célula, a célula à frente não existe
	room = new_room(map_text="S\n", players=((7, "roberto"),))
	room.players[7].keys = 1
	assert press_door(room) == []
	assert room.players[7].keys == 1


def test_dead_player_does_not_open():
	room = new_room()
	room.players[7].keys = 1
	room.players[7].alive = False
	assert press_door(room) == []
	assert door_char(room) == "D"


def test_snapshot_doors_and_grid_delta_agree():
	room = new_room()
	room.players[7].keys = 1
	press_door(room)
	snapshot = to_snapshot(room)
	assert snapshot["doors"] == [{"x": 1, "y": 2, "open": True, "locked": False}]
	assert snapshot["grid_delta"] == [{"x": 1, "y": 2, "c": "O"}]


def test_player_only_passes_after_the_door_opens():
	room = new_room()
	room.players[7].keys = 1
	assert walk_forward(room, 10).y < 2 # fechada: para antes da célula da Door
	press_door(room)
	assert walk_forward(room, 10).y > 2.5 # aberta: atravessa


def test_two_players_press_the_same_door_and_only_one_key_is_spent():
	# os dois de frente para a Door, com uma chave cada, apertando no mesmo Tick
	room = new_room()
	for player, x in zip(room.players.values(), (1.2, 1.8)):
		player.x, player.y, player.angle, player.keys = x, 1.5, math.pi, 1
	enqueue(room, 7, Action(seq=1, kind=ActionKind.DOOR))
	enqueue(room, 9, Action(seq=1, kind=ActionKind.DOOR))
	events = step(room, DT)
	assert [event.data["by"] for event in events] == [7] # o segundo encontra a Door já aberta
	assert (room.players[7].keys, room.players[9].keys) == (0, 1)
