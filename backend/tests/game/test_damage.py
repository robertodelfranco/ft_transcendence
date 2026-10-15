import pytest

from app.game.rules import ENEMY_ATTACK_INTERVAL_S, ENEMY_DAMAGE, TICK_RATE
from app.game.sim import _hurt_player, create_room, enqueue, step
from app.game.state import EnemyState, Event, Input, Mode, RoomOptions
from app.game.world import parse_map

DT = 1 / TICK_RATE
ATTACK_TICKS = round(ENEMY_ATTACK_INTERVAL_S * TICK_RATE) # 42 Ticks
ROW_Y = 3.5
# uma sala aberta: o Player 7 em (1, 3), o Enemy em (6, 3) e o Player 9 em (9, 3), na mesma linha
ARENA = ("11111111111\n10000000001\n10000000001\n1E0000I00W1\n"
	"10000000001\n10000000001\n11111111111\n")
# a mesma sala sem o Enemy, para o Player 7 andar até o 9 sem ninguém no caminho
EMPTY_ARENA = ARENA.replace("I", "0")


def new_room(map_text=ARENA):
	game_map = parse_map(map_text, "t", Mode.COOP)
	return create_room(12, Mode.COOP, game_map, RoomOptions(), [(7, "roberto"), (9, "augusto")], seed=1)


def make_input(seq, **held):
	keys = dict.fromkeys(("up", "down", "left", "right", "rot_left", "rot_right", "sprint"), False)
	keys.update(held)
	return Input(seq=seq, mouse_dx=0.0, **keys)


def strike_player_9(room):
	# o Enemy encostado no Player 9 entra em attack no Tick 1 e golpeia no Tick 1 + ATTACK_TICKS
	[enemy] = room.enemies
	enemy.x, enemy.y = room.players[9].x - 0.6, ROW_Y
	step(room, DT)
	assert enemy.state == EnemyState.ATTACK
	for _ in range(ATTACK_TICKS - 1):
		step(room, DT)
	return step(room, DT)


def test_armor_absorbs_the_blow_before_hp():
	room = new_room()
	target = room.players[9]
	target.armor = 3
	events = strike_player_9(room)
	assert (target.armor, target.hp) == (3 - ENEMY_DAMAGE, 10)
	assert events == [Event("player_hit", room.tick, {"target": 9, "by": None,
		"source": "enemy", "amount": 0, "absorbed": ENEMY_DAMAGE})]


def test_without_armor_the_blow_comes_out_of_hp():
	room = new_room()
	target = room.players[9]
	events = strike_player_9(room)
	assert (target.armor, target.hp) == (0, 10 - ENEMY_DAMAGE)
	assert events == [Event("player_hit", room.tick, {"target": 9, "by": None,
		"source": "enemy", "amount": ENEMY_DAMAGE, "absorbed": 0})]


@pytest.mark.parametrize("armor, hp, expected", [
	# (armor, hp) antes; (amount, absorbed, armor, hp) depois de 3 de dano
	(1, 10, (2, 1, 0, 8)),
	(5, 10, (0, 3, 2, 10)),
	(0, 2, (2, 0, 0, 0)), # o excesso não conta: amount é o HP que o Player tinha
])
def test_damage_splits_between_armor_and_hp(armor, hp, expected):
	# nenhum golpe de Enemy divide o dano (ENEMY_DAMAGE = 1): chama a função direto
	room = new_room()
	player = room.players[7]
	player.armor, player.hp = armor, hp
	events = []
	_hurt_player(room, player, 3, None, "enemy", events)
	amount, absorbed, armor_after, hp_after = expected
	assert events[0].data["amount"] == amount
	assert events[0].data["absorbed"] == absorbed
	assert (player.armor, player.hp) == (armor_after, hp_after)


def test_hp_at_zero_kills_the_player():
	room = new_room()
	target = room.players[9]
	target.hp = 1
	events = strike_player_9(room)
	assert target.hp == 0
	assert target.alive is False
	# o player_hit vem antes do player_died, no mesmo Tick
	assert events == [
		Event("player_hit", room.tick, {"target": 9, "by": None, "source": "enemy",
			"amount": 1, "absorbed": 0}),
		Event("player_died", room.tick, {"player_id": 9, "by": None}),
	]


def test_a_dead_player_is_not_hit_again():
	room = new_room()
	target = room.players[9]
	target.hp = 1
	strike_player_9(room)
	events = []
	for _ in range(3 * ATTACK_TICKS):
		events += step(room, DT)
	assert events == []
	assert target.deaths == 1


@pytest.mark.parametrize("alive, passes", [(True, False), (False, True)])
def test_a_dead_player_stops_colliding(alive, passes):
	# o Player 7 nasce em (1.5, 3.5) olhando para o leste; o 9 fica parado logo à frente
	room = new_room(EMPTY_ARENA)
	walker, other = room.players[7], room.players[9]
	other.x, other.y, other.alive = walker.x + 0.7, walker.y, alive
	for seq in range(1, 31):
		enqueue(room, 7, make_input(seq, up=True))
		step(room, DT)
	assert (walker.x > other.x) is passes


def test_counters_go_up():
	room = new_room()
	target = room.players[9]
	target.armor, target.hp = 1, 1
	strike_player_9(room) # a Armor segura este
	for _ in range(ATTACK_TICKS):
		step(room, DT) # este mata
	assert target.armor_absorbed == 1
	assert target.damage_taken == 1
	assert target.deaths == 1
