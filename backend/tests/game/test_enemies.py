# backend/tests/game/test_enemies.py
import math

import pytest

from app.game.rules import (ENEMY_ATTACK_INTERVAL_S, ENEMY_ATTACK_RANGE, ENEMY_CHASE_RANGE,
	ENEMY_DAMAGE, ENEMY_DYING_S, ENEMY_SEPARATION, ENEMY_SPEED, TICK_RATE)
from app.game.sim import create_room, enqueue, step
from app.game.snapshot import to_snapshot
from app.game.state import (Action, ActionKind, Enemy, EnemyState, Event, Mode, Projectile,
	ProjectileKind, RoomOptions)
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
# um corredor: os Players em (1, 1) e (2, 1), o Enemy ENEMY_CHASE_RANGE + 1 passos depois do 9
FAR_ENEMY_CELL = 3 + ENEMY_CHASE_RANGE
FAR_CORRIDOR = ("1" * (FAR_ENEMY_CELL + 2) + "\n" + "1EW" + "0" * ENEMY_CHASE_RANGE + "I1\n"
	+ "1" * (FAR_ENEMY_CELL + 2) + "\n")
# os Players em (1, 1) e (2, 1), uma Door trancada em (3, 1) e o Enemy em (6, 1)
BEHIND_A_DOOR = "11111111\n1EWD00I1\n11111111\n"


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


def blocker(room, x, y):
	# um Enemy parado no meio de um golpe, que só serve de obstáculo
	enemy = Enemy(id=f"e_{len(room.enemies) + 1}", x=x, y=y, state=EnemyState.ATTACK,
		state_tick=room.tick)
	room.enemies.append(enemy)
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


@pytest.mark.parametrize("cell, target", [(3, 9), (4, 7)])
def test_enemy_only_changes_target_with_a_step_of_advantage(cell, target):
	# o alvo é o 9, a 3 passos; o 7 chega a 3 passos (empate) ou a 2
	room = new_room()
	[enemy] = room.enemies
	run(room, 1)
	assert enemy.target_player_id == 9
	place(room.players[7], cell + 0.5)
	run(room, 1)
	assert enemy.target_player_id == target


def test_the_nearest_is_counted_in_path_steps():
	# o 7 está mais perto em linha reta, mas atrás de uma parede; o 9 está mais perto pelo caminho
	room = new_room(BEHIND_A_WALL)
	[enemy] = room.enemies
	place(room.players[7], 5.5, 3.5) # do outro lado da parede: 1,8 em linha reta, 4 passos
	place(room.players[9], 3.5, 5.7) # 2,2 em linha reta, 2 passos
	run(room, 1)
	assert enemy.target_player_id == 9


@pytest.mark.parametrize("cell, chases", [(3, True), (2, False)])
def test_enemy_only_chases_within_enemy_chase_range(cell, chases):
	# da célula 3 são ENEMY_CHASE_RANGE passos até o Enemy; da 2, um a mais
	room = new_room(FAR_CORRIDOR)
	[enemy] = room.enemies
	place(room.players[9], cell + 0.5, 1.5)
	run(room, 1)
	assert (enemy.target_player_id == 9) == chases
	assert (enemy.x < FAR_ENEMY_CELL + 0.5) == chases


def test_a_closed_door_blocks_the_path_until_it_opens():
	room = new_room(BEHIND_A_DOOR)
	[enemy] = room.enemies
	run(room, 5)
	assert enemy.target_player_id is None # sem caminho: parado
	assert (enemy.x, enemy.y) == (6.5, 1.5)
	opener = room.players[9]
	opener.angle, opener.keys = math.pi / 2, 1 # de frente para a Door, a leste
	enqueue(room, 9, Action(seq=1, kind=ActionKind.DOOR))
	run(room, 1)
	assert enemy.target_player_id == 9 # no mesmo Tick em que a Door abriu
	assert enemy.x < 6.5


def test_the_path_is_redone_when_the_player_changes_cell():
	room = new_room()
	[enemy] = room.enemies
	run(room, 1)
	assert enemy.y == ROW_Y
	place(room.players[9], 9.5, 5.5) # duas células ao sul
	run(room, 1)
	assert enemy.y > ROW_Y # já corta na diagonal


def test_enemy_walks_enemy_speed_per_second():
	room = new_room()
	[enemy] = room.enemies
	run(room, TICK_RATE)
	assert (enemy.x, enemy.y) == pytest.approx((6.5 + ENEMY_SPEED, ROW_Y))


def test_behind_a_wall_the_enemy_goes_around():
	# em linha reta o Enemy ficaria preso na parede; pelo caminho, chega ao alcance do golpe
	room = new_room(BEHIND_A_WALL)
	room.players[7].alive = False
	[enemy] = room.enemies
	run(room, 3 * TICK_RATE)
	assert enemy.target_player_id == 9
	assert enemy.state == EnemyState.ATTACK


def test_blocked_by_another_enemy_the_enemy_steps_to_one_perpendicular_side():
	room = new_room()
	[enemy] = room.enemies
	blocker(room, 6.5 + ENEMY_SEPARATION + STEP / 2, ROW_Y) # o passo para o leste fica perto demais
	run(room, 1)
	assert (enemy.x, enemy.y) == pytest.approx((6.5, ROW_Y - STEP)) # um passo para o norte


def test_with_the_first_side_blocked_the_enemy_steps_to_the_other():
	room = new_room()
	[enemy] = room.enemies
	blocker(room, 6.5 + ENEMY_SEPARATION + STEP / 2, ROW_Y)
	blocker(room, 6.5, ROW_Y - ENEMY_SEPARATION - STEP / 2) # e o norte também
	run(room, 1)
	assert (enemy.x, enemy.y) == pytest.approx((6.5, ROW_Y + STEP)) # um passo para o sul


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
	place(target, enemy.x - 2.0) # afastou-se durante o golpe
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
