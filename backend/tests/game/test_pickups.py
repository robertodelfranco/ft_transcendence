# backend/tests/game/test_pickups.py
import pytest

from app.game.rules import POTION_HEAL, RULESET_NUMBERS, TICK_RATE
from app.game.sim import create_room, enqueue, step
from app.game.snapshot import to_snapshot
from app.game.state import Event, Input, Mode, RoomOptions
from app.game.world import parse_map

DT = 1 / TICK_RATE
NUMBERS = RULESET_NUMBERS[Mode.COOP]
REGEN_TICK = NUMBERS["MANA_REGEN_PER_S"] * DT # a regeneração do Tick vem depois da coleta
# o Player 7 nasce em (1, 1); na linha de baixo, um Pickup de cada tipo
MAP_TEXT = "1111111\n1N000S1\n1KPMA01\n1111111\n"
KEY, POTION, MANA, ARMOR = (1, 2), (2, 2), (3, 2), (4, 2)
NO_KEYS = dict.fromkeys(("up", "down", "left", "right", "rot_left", "rot_right", "sprint"), False)


def new_room(start_hp=10):
	game_map = parse_map(MAP_TEXT, "t", Mode.COOP)
	options = RoomOptions(start_hp=start_hp)
	return create_room(12, Mode.COOP, game_map, options, [(7, "roberto"), (9, "augusto")], seed=1)


def send(room, **held):
	# um Input do Player 7 e um Tick; devolve os Events desse Tick
	player = room.players[7]
	enqueue(room, 7, Input(seq=player.last_queued_seq + 1, mouse_dx=0.0, **{**NO_KEYS, **held}))
	return step(room, DT)


def stand_on(room, cell):
	# põe o Player 7 no centro da célula e aplica um Input parado
	column, row = cell
	room.players[7].x, room.players[7].y = column + 0.5, row + 0.5
	return send(room)


def cell_char(room, cell):
	column, row = cell
	return room.grid[row][column]


def test_key_is_collected_and_announced():
	room = new_room()
	events = stand_on(room, KEY)
	player = room.players[7]
	assert (player.keys, player.keys_collected) == (1, 1)
	assert cell_char(room, KEY) == "0"
	assert events == [Event("item_picked", 1, {"kind": "key", "by": 7, "x": 1, "y": 2})]


@pytest.mark.parametrize("hp, expected", [(5, 5 + POTION_HEAL), (9, 10)])
def test_potion_heals_up_to_start_hp(hp, expected):
	room = new_room(start_hp=10)
	room.players[7].hp = hp
	events = stand_on(room, POTION)
	assert room.players[7].hp == expected
	assert room.players[7].potions_used == 1
	assert [event.data["kind"] for event in events] == ["potion"]


@pytest.mark.parametrize("mana, expected", [
	(50.0, 50.0 + NUMBERS["MANA_PICKUP"] + REGEN_TICK), (90.0, NUMBERS["MANA_MAX"])])
def test_mana_pickup_adds_up_to_mana_max(mana, expected):
	room = new_room()
	room.players[7].mana = mana
	stand_on(room, MANA)
	assert room.players[7].mana == pytest.approx(expected)
	assert cell_char(room, MANA) == "0"


@pytest.mark.parametrize("armor", [0, 1])
def test_armor_pickup_sets_armor_points_without_stacking(armor):
	room = new_room()
	room.players[7].armor = armor
	stand_on(room, ARMOR)
	assert room.players[7].armor == NUMBERS["ARMOR_POINTS"]


@pytest.mark.parametrize("cell, char", [(POTION, "P"), (MANA, "M"), (ARMOR, "A")])
def test_pickup_that_is_no_use_stays_on_the_floor(cell, char):
	# o Player nasce com HP e Mana cheios; a Armor é posta no teto para o teste
	room = new_room()
	room.players[7].armor = NUMBERS["ARMOR_POINTS"]
	events = stand_on(room, cell)
	assert cell_char(room, cell) == char
	assert events == []
	assert room.players[7].potions_used == 0


def test_collection_uses_the_cell_of_the_new_position():
	# a chave está na célula (1, 2), que começa em y = 2.0
	room = new_room()
	player = room.players[7]
	player.x, player.y = 1.5, 1.80
	send(room, down=True) # y = 1.92: ainda na célula de cima
	assert player.keys == 0
	send(room, down=True) # y = 2.04: entrou na célula da chave
	assert player.keys == 1


def test_dead_player_does_not_collect():
	room = new_room()
	room.players[7].alive = False
	assert stand_on(room, KEY) == []
	assert cell_char(room, KEY) == "K"


def test_collected_pickup_shows_in_the_grid_delta():
	room = new_room()
	stand_on(room, KEY)
	assert to_snapshot(room)["grid_delta"] == [{"x": 1, "y": 2, "c": "0"}]


def test_two_players_on_the_same_pickup_only_the_first_collects():
	# os dois na célula da chave, o que a colisão normalmente impede; um Input de cada no mesmo Tick
	room = new_room()
	for player in room.players.values():
		player.x, player.y = KEY[0] + 0.5, KEY[1] + 0.5
	enqueue(room, 7, Input(seq=1, mouse_dx=0.0, **NO_KEYS))
	enqueue(room, 9, Input(seq=1, mouse_dx=0.0, **NO_KEYS))
	events = step(room, DT)
	assert [event.data["by"] for event in events] == [7] # quem entrou primeiro na Room
	assert (room.players[7].keys, room.players[9].keys) == (1, 0)


def test_living_player_collects_under_a_dead_one():
	# o Player morto não bloqueia nem coleta; o vivo anda até a célula e pega a chave
	room = new_room()
	dead, alive = room.players[9], room.players[7]
	dead.x, dead.y, dead.alive = KEY[0] + 0.5, KEY[1] + 0.5, False
	alive.x, alive.y = 1.5, 1.8
	for _ in range(3):
		send(room, down=True) # olhando para o norte, down anda para o sul
	assert alive.keys == 1
	assert cell_char(room, KEY) == "0"
