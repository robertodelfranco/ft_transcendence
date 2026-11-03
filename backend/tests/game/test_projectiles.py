# backend/tests/game/test_projectiles.py
import pytest

from app.game.rules import (PROJECTILE_HIT_RADIUS, PROJECTILE_HIT_S, PROJECTILE_MAX_SUBSTEP,
	PROJECTILE_RADIUS, PROJECTILE_SPEED, TICK_RATE)
from app.game.sim import create_room, step
from app.game.snapshot import to_snapshot
from app.game.state import (EnemyState, Mode, Projectile, ProjectileKind, ProjectileState,
	RoomOptions)
from app.game.world import parse_map

DT = 1 / TICK_RATE
HIT_TICKS = round(PROJECTILE_HIT_S * TICK_RATE) # 12 Ticks
# um corredor de oeste a leste: o Player 7 nasce em (1, 1) e o 9 em (17, 1); a parede fica em x = 18
CORRIDOR = "1111111111111111111\n1E000000000000000W1\n1111111111111111111\n"
WITH_ENEMY = "1111111111111111111\n1E0000I0000000000W1\n1111111111111111111\n"
WITH_BOSS = "1111111111111111111\n1E0000B0000000000W1\n1111111111111111111\n"
WITH_DOOR = "1111111\n1E0D0W1\n1111111\n"
WALL_X = 18.0
ROW_Y = 1.5 # o meio do corredor


def new_room(map_text=CORRIDOR, mode=Mode.COOP):
	game_map = parse_map(map_text, "t", mode)
	return create_room(12, mode, game_map, RoomOptions(), [(7, "roberto"), (9, "augusto")], seed=1)


def shoot(room, x, y=ROW_Y, kind=ProjectileKind.FIREBALL, owner_id=7):
	# põe na Room um Projectile que voa para o leste
	shot = Projectile(id="t_1", kind=kind, owner_id=owner_id, x=x, y=y, dx=1.0, dy=0.0)
	room.projectiles.append(shot)
	return shot


def fly(room, ticks):
	for _ in range(ticks):
		step(room, DT)


def fly_until_hit(room, shot, max_ticks=60):
	for _ in range(max_ticks):
		step(room, DT)
		if shot.state == ProjectileState.HIT:
			return
	raise AssertionError(f"o Projectile não acertou nada em {max_ticks} Ticks")


def stopped_just_before(shot, target):
	# parou antes do alvo, no último subpasso fora do PROJECTILE_HIT_RADIUS
	gap = target.x - shot.x
	return PROJECTILE_HIT_RADIUS <= gap < PROJECTILE_HIT_RADIUS + PROJECTILE_MAX_SUBSTEP + 1e-9


@pytest.mark.parametrize("ticks, dt", [(TICK_RATE, DT), (1, 1.0)])
def test_one_second_of_flight_covers_projectile_speed(ticks, dt):
	# velocidade × dt: 30 Ticks de 1/30 s e um Tick de 1 s andam o mesmo
	room = new_room()
	shot = shoot(room, x=1.5)
	for _ in range(ticks):
		step(room, dt)
	assert shot.x == pytest.approx(1.5 + PROJECTILE_SPEED)
	assert shot.y == ROW_Y
	assert shot.state == ProjectileState.MOVING


def test_projectile_hits_the_wall_and_stops_outside_it():
	room = new_room()
	shot = shoot(room, x=15.5)
	fly_until_hit(room, shot)
	assert WALL_X - PROJECTILE_RADIUS - PROJECTILE_MAX_SUBSTEP - 1e-9 < shot.x
	assert shot.x + PROJECTILE_RADIUS < WALL_X # a caixa do Projectile não entrou na parede
	stopped_at = shot.x
	step(room, DT)
	assert shot.x == stopped_at # em hit, não anda mais


def test_hit_lasts_projectile_hit_s_and_then_leaves_the_snapshot():
	room = new_room()
	shoot(room, x=17.85) # encostado na parede: bate no Tick 1
	fly(room, 1)
	for _ in range(HIT_TICKS - 1): # Ticks 1 a 11
		assert [shown["state"] for shown in to_snapshot(room)["projectiles"]] == ["hit"]
		step(room, DT)
	assert [shown["state"] for shown in to_snapshot(room)["projectiles"]] == ["hit"] # Tick 12
	step(room, DT)
	assert to_snapshot(room)["projectiles"] == [] # Tick 13: 0,4 s depois do impacto


def test_closed_door_stops_the_fireball():
	room = new_room(WITH_DOOR)
	shot = shoot(room, x=1.5)
	fly_until_hit(room, shot)
	assert shot.x + PROJECTILE_RADIUS < 3.0 # a Door está na célula (3, 1)


def test_open_door_lets_the_fireball_through():
	room = new_room(WITH_DOOR)
	room.grid[1][3] = "O" # a Door já aberta
	shot = shoot(room, x=1.5)
	fly(room, 7)
	assert shot.x > 4.0
	assert shot.state == ProjectileState.MOVING


def test_target_on_the_path_is_hit_even_when_the_tick_covers_more_than_a_cell():
	# o teste do subpasso: num Tick de 0,5 s o Projectile andaria 6 células e passaria do Enemy
	room = new_room(WITH_ENEMY)
	[enemy] = room.enemies
	shot = shoot(room, x=1.5)
	step(room, 0.5)
	assert shot.state == ProjectileState.HIT
	assert stopped_just_before(shot, enemy)


@pytest.mark.parametrize("offset, is_hit", [(0.2, True), (0.4, False)])
def test_only_a_target_within_hit_radius_of_the_path_is_hit(offset, is_hit):
	room = new_room(WITH_ENEMY)
	[enemy] = room.enemies
	enemy.y = ROW_Y + offset # ao lado do caminho
	shot = shoot(room, x=1.5)
	fly(room, 20)
	assert (shot.state == ProjectileState.HIT) == is_hit
	assert (shot.x > enemy.x) != is_hit # quem não acertou passou direto


def test_fireball_hits_the_boss_even_in_idle():
	room = new_room(WITH_BOSS)
	shot = shoot(room, x=1.5)
	fly_until_hit(room, shot)
	assert stopped_just_before(shot, room.boss)


def test_fireball_does_not_hit_its_owner():
	# no pvp a fireball acerta Player, e nasce em cima do dono
	room = new_room(mode=Mode.PVP)
	owner = room.players[7]
	shot = shoot(room, x=owner.x, owner_id=7)
	fly(room, 1)
	assert shot.state == ProjectileState.MOVING
	assert shot.x > owner.x


def test_fireball_hits_the_other_player_in_pvp():
	room = new_room(mode=Mode.PVP)
	shot = shoot(room, x=1.5, owner_id=7)
	fly_until_hit(room, shot)
	assert stopped_just_before(shot, room.players[9])


def test_fireball_hits_no_player_in_coop():
	# não existe fogo amigo: a fireball passa pelo Player 9 e só para na parede
	room = new_room()
	shot = shoot(room, x=15.5, owner_id=7)
	fly_until_hit(room, shot)
	assert shot.x > room.players[9].x


def test_bullet_passes_enemies_and_hits_a_player():
	room = new_room(WITH_ENEMY)
	[enemy] = room.enemies
	shot = shoot(room, x=3.5, kind=ProjectileKind.BULLET, owner_id=None)
	fly_until_hit(room, shot)
	assert shot.x > enemy.x
	assert stopped_just_before(shot, room.players[9])


def test_dying_enemy_does_not_stop_the_fireball():
	room = new_room(WITH_ENEMY)
	[enemy] = room.enemies
	enemy.state = EnemyState.DYING
	shot = shoot(room, x=1.5)
	fly(room, 20)
	assert shot.x > enemy.x
	assert shot.state == ProjectileState.MOVING


@pytest.mark.parametrize("field", ["alive", "left"])
def test_dead_or_gone_player_does_not_stop_a_projectile(field):
	room = new_room(mode=Mode.PVP)
	other = room.players[9]
	setattr(other, field, field == "left") # morto, ou fora da partida
	shot = shoot(room, x=17.25, owner_id=7)
	step(room, DT) # leave encerra o PvP neste Tick; o Projectile ainda voa antes do game_over
	assert shot.x > other.x
