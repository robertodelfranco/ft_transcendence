import math

import pytest

from app.game.movement import is_solid
from app.game.rules import (BOSS_ATTACK_COOLDOWN_S, BOSS_ATTACK_WINDUP_S, BOSS_HP, BOSS_MIN_RANGE,
	BOSS_RADIUS, BOSS_SIGHT_RANGE, BOSS_SPEED, BULLET_DAMAGE, ENEMY_SEPARATION,
	FIREBALL_BOSS_DAMAGE, TICK_RATE)
from app.game.sim import create_room, step
from app.game.state import (BossState, Enemy, Event, Mode, Projectile, ProjectileKind,
	RoomOptions)
from app.game.world import parse_map

DT = 1 / TICK_RATE
STEP = BOSS_SPEED * DT # o que o Boss anda num Tick
WINDUP_TICKS = round(BOSS_ATTACK_WINDUP_S * TICK_RATE) # 36 Ticks
COOLDOWN_TICKS = round(BOSS_ATTACK_COOLDOWN_S * TICK_RATE) # 66 Ticks
# um corredor de 30 células: os Players nascem em (1, 1) e (1, 2), o Boss em (30, 2)
WIDTH = 32
CORRIDOR = ("1" * WIDTH + "\n" + "1E" + "0" * (WIDTH - 3) + "1\n"
	+ "1W" + "0" * (WIDTH - 4) + "B1\n" + "1" + "0" * (WIDTH - 2) + "1\n" + "1" * WIDTH + "\n")
BOSS_X, ROW_Y = 30.5, 2.5
WALL_COLUMN = 25


def new_room(map_text=CORRIDOR):
	game_map = parse_map(map_text, "t", Mode.COOP)
	return create_room(12, Mode.COOP, game_map, RoomOptions(), [(7, "roberto"), (9, "augusto")], seed=1)


def walled_corridor():
	# o mesmo corredor com uma parede de ponta a ponta na coluna WALL_COLUMN
	rows = CORRIDOR.split("\n")
	for y in (1, 2, 3):
		rows[y] = rows[y][:WALL_COLUMN] + "1" + rows[y][WALL_COLUMN + 1:]
	return "\n".join(rows)


def place(entity, x, y=ROW_Y):
	entity.x, entity.y = x, y


def run(room, ticks):
	events = []
	for _ in range(ticks):
		events += step(room, DT)
	return events


def bullet_ticks(room, ticks):
	# os Ticks em que nasce um bullet novo, com a direção dele
	seen, fired = set(), []
	for _ in range(ticks):
		step(room, DT)
		for shot in room.projectiles:
			if shot.kind == ProjectileKind.BULLET and shot.id not in seen:
				seen.add(shot.id)
				fired.append((room.tick, shot))
	return fired


def fireball_at_boss(room, number, owner_id=7):
	# uma fireball a 1 célula do Boss, indo para ele
	boss = room.boss
	room.projectiles.append(Projectile(id=f"t_{number}", kind=ProjectileKind.FIREBALL,
		owner_id=owner_id, x=boss.x - 1.0, y=boss.y, dx=1.0, dy=0.0))
	return run(room, 5)


def test_stays_idle_until_a_player_comes_within_boss_sight_range():
	room = new_room()
	boss = room.boss
	place(room.players[7], BOSS_X - BOSS_SIGHT_RANGE - 0.5)
	run(room, 5)
	assert boss.state == BossState.IDLE
	assert (boss.x, boss.y) == (BOSS_X, ROW_Y)
	place(room.players[7], BOSS_X - BOSS_SIGHT_RANGE + 0.1)
	run(room, 1)
	assert boss.state == BossState.ALERT
	assert boss.target_player_id == 7


def test_walks_boss_speed_toward_a_target_beyond_attack_range():
	room = new_room()
	boss = room.boss
	place(room.players[7], BOSS_X - 19.5)
	run(room, 1)
	assert boss.x == pytest.approx(BOSS_X - STEP)
	assert boss.y == pytest.approx(ROW_Y)


@pytest.mark.parametrize("distance, walks", [(12.0, True), (BOSS_MIN_RANGE - 1, False)])
def test_walks_only_while_the_target_is_beyond_boss_min_range(distance, walks):
	room = new_room()
	boss = room.boss
	boss.attack_ready_tick = 10**6 # cooldown pendente: não entra em attack
	place(room.players[7], BOSS_X - distance)
	run(room, 1)
	assert (boss.x < BOSS_X) is walks


def test_does_not_walk_through_a_wall():
	room = new_room(walled_corridor())
	boss = room.boss
	place(room.players[7], BOSS_X - 19.0)
	for _ in range(10 * TICK_RATE):
		step(room, DT)
		assert not any(is_solid(room.grid, boss.x + dx, boss.y + dy)
			for dx in (-BOSS_RADIUS, BOSS_RADIUS) for dy in (-BOSS_RADIUS, BOSS_RADIUS))
	assert boss.x > WALL_COLUMN + 1 # parou na parede, sem passar


def test_does_not_walk_through_an_enemy():
	# o Enemy fica entre o Boss e o Player, longe demais do Player para persegui-lo
	room = new_room()
	boss = room.boss
	enemy = Enemy(id="e_t", x=BOSS_X - 1.5, y=ROW_Y)
	room.enemies.append(enemy)
	place(room.players[7], BOSS_X - 19.0)
	for _ in range(3 * TICK_RATE):
		step(room, DT)
		assert math.hypot(boss.x - enemy.x, boss.y - enemy.y) >= ENEMY_SEPARATION


def test_the_bullet_leaves_after_the_windup_toward_the_target():
	room = new_room()
	place(room.players[7], BOSS_X - 15.0)
	run(room, 1)
	assert room.boss.state == BossState.ATTACK # Tick 1
	[(tick, shot)] = bullet_ticks(room, WINDUP_TICKS)
	assert tick == 1 + WINDUP_TICKS
	assert shot.owner_id is None
	assert (shot.dx, shot.dy) == pytest.approx((-1.0, 0.0))


def test_two_bullets_are_boss_attack_cooldown_s_apart():
	room = new_room()
	place(room.players[7], BOSS_X - 15.0)
	ticks = [tick for tick, _ in bullet_ticks(room, 1 + WINDUP_TICKS + 2 * COOLDOWN_TICKS)]
	assert ticks == [1 + WINDUP_TICKS, 1 + WINDUP_TICKS + COOLDOWN_TICKS,
		1 + WINDUP_TICKS + 2 * COOLDOWN_TICKS]


def test_with_two_players_the_target_alternates_every_shot():
	# o 7 numa linha acima do Boss e o 9 numa abaixo; o 7 um pouco mais perto, para ser o primeiro
	room = new_room()
	place(room.players[7], BOSS_X - 14.9, ROW_Y - 1)
	place(room.players[9], BOSS_X - 15.0, ROW_Y + 1)
	fired = bullet_ticks(room, 1 + WINDUP_TICKS + 2 * COOLDOWN_TICKS)
	targets = [7 if shot.dy < 0 else 9 for _, shot in fired]
	assert targets == [7, 9, 7]


def test_six_fireballs_kill_the_boss():
	room = new_room()
	boss, shooter = room.boss, room.players[7]
	events = []
	for number in range(1, 7):
		events += fireball_at_boss(room, number)
		assert boss.hp == BOSS_HP - number * FIREBALL_BOSS_DAMAGE
	assert boss.state == BossState.DYING
	assert [event for event in events if event.name == "boss_died"] == [
		Event("boss_died", boss.state_tick, {"killer_id": 7})]
	assert shooter.damage_dealt == BOSS_HP
	assert shooter.kills == 1


def test_a_hit_wakes_an_idle_boss_aimed_at_the_shooter():
	# os dois Players nos Spawns, longe demais para o Boss ver
	room = new_room()
	boss = room.boss
	run(room, 1)
	assert boss.state == BossState.IDLE
	fireball_at_boss(room, 1)
	assert boss.hp == BOSS_HP - FIREBALL_BOSS_DAMAGE
	assert boss.state == BossState.ALERT
	assert boss.target_player_id == 7


def test_the_bullet_takes_bullet_damage():
	room = new_room()
	target = room.players[9] # no Spawn, em (1.5, 2.5), longe do Boss
	room.projectiles.append(Projectile(id="t_1", kind=ProjectileKind.BULLET, owner_id=None,
		x=target.x + 1.0, y=target.y, dx=-1.0, dy=0.0))
	events = run(room, 5)
	assert target.hp == 10 - BULLET_DAMAGE
	assert [event.data for event in events if event.name == "player_hit"] == [
		{"target": 9, "by": None, "source": "bullet", "amount": BULLET_DAMAGE, "absorbed": 0}]
