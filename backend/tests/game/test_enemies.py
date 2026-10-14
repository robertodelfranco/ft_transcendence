# backend/tests/game/test_enemies.py
import math

import pytest

from app.game.rules import (ENEMY_ATTACK_INTERVAL_S, ENEMY_ATTACK_RANGE, ENEMY_DAMAGE,
	ENEMY_DYING_S, ENEMY_SEPARATION, ENEMY_SPEED, TICK_RATE)
from app.game.sim import create_room, step
from app.game.snapshot import to_snapshot
from app.game.state import (EnemyState, Event, Mode, Projectile, ProjectileKind, RoomOptions)
from app.game.world import parse_map

DT = 1 / TICK_RATE
STEP = ENEMY_SPEED * DT # o que um Enemy anda num Tick
ATTACK_TICKS = round(ENEMY_ATTACK_INTERVAL_S * TICK_RATE) # 42 Ticks
DYING_TICKS = round(ENEMY_DYING_S * TICK_RATE) # 45 Ticks
ROW_Y = 3.5
# uma sala aberta: o Player 7 em (1, 3), o Enemy em (6, 3) e o Player 9 em (9, 3), na mesma linha
ARENA = ("11111111111\n10000000001\n10000000001\n1E0000I00W1\n"
	"10000000001\n10000000001\n11111111111\n")
TWO_ENEMIES = ARENA.replace("1E0000I00W1", "1E00I0I00W1")
# o Enemy em (3, 3), uma parede em (4, 3) e o Player 9 atrás dela, em (5, 3)
BEHIND_A_WALL = "1111111\n1E00001\n1000001\n100I1W1\n1000001\n1000001\n1111111\n"


def new_room(map_text=ARENA):
	# ninguém manda join: os Players ficam desconectados, e mesmo assim são alvo
	game_map = parse_map(map_text, "t", Mode.COOP)
	return create_room(12, Mode.COOP, game_map, RoomOptions(), [(7, "roberto"), (9, "augusto")], seed=1)


def place(entity, x, y=ROW_Y):
	entity.x, entity.y = x, y


def run(room, ticks):
	events = []
	for _ in range(ticks):
		events += step(room, DT)
	return events


def gap(a, b):
	return math.hypot(a.x - b.x, a.y - b.y)


def in_attack(room):
	# o Enemy encostado no Player 9, que entra em attack no Tick 1
	[enemy] = room.enemies
	place(enemy, room.players[9].x - 0.6)
	run(room, 1)
	assert enemy.state == EnemyState.ATTACK
	return enemy


def shoot_at(room, enemy, owner_id=7):
	# uma fireball a meia célula do Enemy, vindo do oeste
	shot = Projectile(id="t_1", kind=ProjectileKind.FIREBALL, owner_id=owner_id,
		x=enemy.x - 0.5, y=enemy.y, dx=1.0, dy=0.0)
	room.projectiles.append(shot)


def test_enemy_chases_the_nearest_living_player():
	# o Player 9 está a 3 células e o 7 a 5
	room = new_room()
	[enemy] = room.enemies
	run(room, 1)
	assert enemy.target_player_id == 9
	assert (enemy.x, enemy.y) == pytest.approx((6.5 + STEP, ROW_Y))
	assert enemy.state == EnemyState.ALERT


@pytest.mark.parametrize("field", ["alive", "left"])
def test_enemy_ignores_a_dead_player_and_one_who_left(field):
	room = new_room()
	[enemy] = room.enemies
	setattr(room.players[9], field, field == "left") # o mais próximo morreu, ou saiu
	run(room, 1)
	assert enemy.target_player_id == 7
	assert enemy.x < 6.5


def test_without_a_target_the_enemy_stands_still():
	room = new_room()
	[enemy] = room.enemies
	run(room, 1)
	for player in room.players.values():
		player.alive = False
	run(room, 10)
	assert enemy.target_player_id is None
	assert (enemy.x, enemy.y) == pytest.approx((6.5 + STEP, ROW_Y))
	assert enemy.state == EnemyState.ALERT


@pytest.mark.parametrize("advantage, target", [(0.9, 9), (1.1, 7)])
def test_enemy_only_changes_target_with_a_cell_of_advantage(advantage, target):
	room = new_room()
	[enemy] = room.enemies
	run(room, 1)
	assert enemy.target_player_id == 9
	# o Player 7 chega mais perto que o alvo atual, por menos e por mais que 1 célula
	place(room.players[7], enemy.x - (gap(enemy, room.players[9]) - advantage))
	run(room, 1)
	assert enemy.target_player_id == target


def test_enemy_walks_enemy_speed_per_second():
	room = new_room()
	[enemy] = room.enemies
	run(room, TICK_RATE)
	assert (enemy.x, enemy.y) == pytest.approx((6.5 + ENEMY_SPEED, ROW_Y))


def test_blocked_by_a_wall_the_enemy_steps_to_one_perpendicular_side():
	room = new_room(BEHIND_A_WALL)
	[enemy] = room.enemies
	place(enemy, 3.78) # o próximo passo para o leste já toca a parede em x = 4
	run(room, 1)
	assert enemy.target_player_id == 9
	assert (enemy.x, enemy.y) == pytest.approx((3.78, ROW_Y - STEP)) # um passo para o norte


def test_with_the_first_side_blocked_the_enemy_steps_to_the_other():
	room = new_room(BEHIND_A_WALL)
	[enemy] = room.enemies
	room.grid[2][3] = "1" # uma parede também ao norte do Enemy
	place(enemy, 3.78, 3.22)
	place(room.players[9], 5.5, 3.22) # o alvo na mesma linha: a direção é o leste exato
	run(room, 1)
	assert (enemy.x, enemy.y) == pytest.approx((3.78, 3.22 + STEP)) # um passo para o sul


def test_enemy_stays_enemy_separation_away_from_another_enemy():
	# os dois perseguem o Player 9; o de trás alcança o da frente, que parou para golpear
	room = new_room(TWO_ENEMIES)
	room.players[7].alive = False
	back, front = room.enemies
	closest = gap(back, front)
	for _ in range(5 * TICK_RATE):
		step(room, DT)
		closest = min(closest, gap(back, front))
	assert closest >= ENEMY_SEPARATION - 1e-9
	assert front.state == EnemyState.ATTACK


def test_a_dying_enemy_does_not_hold_another_one():
	room = new_room(TWO_ENEMIES)
	room.players[7].alive = False
	back, front = room.enemies
	place(front, back.x + 0.5) # mais perto que ENEMY_SEPARATION
	front.state = EnemyState.DYING
	run(room, 20)
	assert back.x > front.x


def test_in_attack_range_the_enemy_enters_attack_and_stops():
	room = new_room()
	enemy = in_attack(room)
	stopped_at = (enemy.x, enemy.y)
	assert gap(enemy, room.players[9]) <= ENEMY_ATTACK_RANGE
	run(room, 10)
	assert (enemy.x, enemy.y) == stopped_at
	assert enemy.state == EnemyState.ATTACK


def test_the_blow_lands_after_enemy_attack_interval_s():
	room = new_room()
	in_attack(room) # Tick 1
	target = room.players[9]
	run(room, ATTACK_TICKS - 1) # até o Tick 42
	assert target.hp == 10
	run(room, 1) # Tick 43: 1,4 s depois de entrar em attack
	assert target.hp == 10 - ENEMY_DAMAGE


def test_blows_in_a_row_are_exactly_one_interval_apart():
	room = new_room()
	in_attack(room)
	target = room.players[9]
	hit_ticks = []
	for _ in range(3 * ATTACK_TICKS):
		hp = target.hp
		step(room, DT)
		if target.hp < hp:
			hit_ticks.append(room.tick)
	assert hit_ticks == [1 + ATTACK_TICKS, 1 + 2 * ATTACK_TICKS, 1 + 3 * ATTACK_TICKS]


def test_a_target_that_left_the_range_is_not_hit():
	room = new_room()
	enemy = in_attack(room)
	target = room.players[9]
	place(target, enemy.x + 2.0) # afastou-se durante o golpe
	run(room, ATTACK_TICKS)
	assert target.hp == 10
	assert enemy.state == EnemyState.ALERT # voltou a perseguir
	assert enemy.target_player_id == 9


@pytest.mark.parametrize("field", ["alive", "left"])
def test_a_target_that_died_or_left_is_not_hit(field):
	room = new_room()
	enemy = in_attack(room)
	target = room.players[9]
	setattr(target, field, field == "left")
	run(room, ATTACK_TICKS)
	assert target.hp == 10
	assert enemy.target_player_id == 7 # o Player que sobrou


def test_fireball_puts_the_enemy_in_dying_and_announces_the_killer():
	room = new_room()
	[enemy] = room.enemies
	shoot_at(room, enemy, owner_id=7)
	events = run(room, 1)
	assert enemy.state == EnemyState.DYING
	assert events == [Event("enemy_died", 1, {"enemy_id": "e_1", "killer_id": 7})]
	assert (room.players[7].kills, room.players[9].kills) == (1, 0)


def test_dying_lasts_enemy_dying_s_and_then_leaves_the_snapshot():
	room = new_room()
	[enemy] = room.enemies
	shoot_at(room, enemy)
	run(room, 1) # Tick 1: entra em dying
	died_at = (enemy.x, enemy.y)
	for _ in range(DYING_TICKS - 1): # Ticks 1 a 44
		assert [shown["state"] for shown in to_snapshot(room)["enemies"]] == ["dying"]
		step(room, DT)
	assert [shown["state"] for shown in to_snapshot(room)["enemies"]] == ["dying"] # Tick 45
	assert (enemy.x, enemy.y) == died_at # em dying, não anda
	step(room, DT)
	assert to_snapshot(room)["enemies"] == [] # Tick 46: 1,5 s depois


def test_an_enemy_killed_during_the_attack_does_not_land_the_blow():
	room = new_room()
	enemy = in_attack(room)
	run(room, 10)
	shoot_at(room, enemy)
	run(room, ATTACK_TICKS)
	assert enemy.state == EnemyState.DYING
	assert room.players[9].hp == 10
