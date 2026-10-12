# backend/tests/game/test_movement.py
import math

import pytest

from app.game.movement import Body, CollisionWorld, apply_input
from app.game.rules import (MOUSE_MAX_ROT_SPEED, PLAYER_RADIUS, PLAYER_ROT_SPEED,
	PLAYER_SPEED, PLAYER_SPRINT_MULT, TICK_RATE)
from app.game.state import Input

DT = 1 / TICK_RATE
# 1 s são 30 somas de ponto flutuante: o erro acumulado fica perto de 1e-15.
# 1e-9 é folgado para isso e ainda acusa qualquer erro de fórmula.
TOLERANCE = 1e-9
NORTH = Body(x=10.5, y=10.5, angle=0.0) # como um Spawn N, no meio da sala


def open_world(size=21):
	# uma sala quadrada vazia, com parede em volta
	wall = ["1"] * size
	rows = [["1"] + ["0"] * (size - 2) + ["1"] for _ in range(size - 2)]
	return CollisionWorld(grid=[wall, *rows, wall], bodies=())


def make_input(mouse_dx=0.0, **held):
	keys = dict.fromkeys(("up", "down", "left", "right", "rot_left", "rot_right", "sprint"), False)
	keys.update(held)
	return Input(seq=1, mouse_dx=mouse_dx, **keys)


def hold(body, seconds, **held):
	# segura as teclas por esse tempo: um Input por Tick
	world = open_world()
	for _ in range(round(seconds * TICK_RATE)):
		body = apply_input(body, make_input(**held), world, DT)
	return body


def direction(body):
	return math.sin(body.angle), -math.cos(body.angle)


@pytest.mark.mirror
def test_rot_right_from_north_turns_east():
	dx, _ = direction(hold(NORTH, 1.0, rot_right=True))
	assert dx > 0


def test_one_second_of_rot_right_turns_rot_speed():
	assert hold(NORTH, 1.0, rot_right=True).angle == pytest.approx(PLAYER_ROT_SPEED, abs=TOLERANCE)


@pytest.mark.parametrize("sign", [1, -1])
def test_mouse_turn_is_cut_at_the_limit(sign):
	body = apply_input(NORTH, make_input(mouse_dx=sign * 100.0), open_world(), DT)
	assert body.angle == pytest.approx(sign * MOUSE_MAX_ROT_SPEED * DT, abs=TOLERANCE)


def test_mouse_turn_below_the_limit_is_kept():
	body = apply_input(NORTH, make_input(mouse_dx=-0.0125), open_world(), DT)
	assert body.angle == pytest.approx(-0.0125, abs=TOLERANCE)


def test_rot_left_and_rot_right_cancel():
	assert hold(NORTH, 1.0, rot_left=True, rot_right=True).angle == 0.0


def test_direction_stays_unit_after_many_turns():
	body, world = NORTH, open_world()
	for _ in range(10_000):
		body = apply_input(body, make_input(mouse_dx=0.3, rot_right=True), world, DT)
	assert math.hypot(*direction(body)) == pytest.approx(1.0, abs=TOLERANCE)


def test_one_second_forward_covers_player_speed():
	body = hold(NORTH, 1.0, up=True)
	assert (body.x, body.y) == pytest.approx((NORTH.x, NORTH.y - PLAYER_SPEED), abs=TOLERANCE)


def test_sprint_multiplies_the_distance():
	body = hold(NORTH, 1.0, up=True, sprint=True)
	assert NORTH.y - body.y == pytest.approx(PLAYER_SPEED * PLAYER_SPRINT_MULT, abs=TOLERANCE)


def test_diagonal_is_not_faster():
	body = hold(NORTH, 1.0, up=True, right=True)
	distance = math.hypot(body.x - NORTH.x, body.y - NORTH.y)
	assert distance == pytest.approx(PLAYER_SPEED, abs=TOLERANCE)


@pytest.mark.mirror
def test_right_from_north_moves_east():
	assert hold(NORTH, 1.0, right=True).x > NORTH.x


def test_opposite_keys_leave_the_player_still():
	assert hold(NORTH, 1.0, up=True, down=True) == NORTH
	assert hold(NORTH, 1.0, left=True, right=True) == NORTH


EAST = Body(x=1.5, y=1.5, angle=math.pi / 2) # no começo de um corredor, olhando para o leste


def world_from(*rows):
	return CollisionWorld(grid=[list(row) for row in rows], bodies=())


def walk(body, world, seconds, **held):
	for _ in range(round(seconds * TICK_RATE)):
		body = apply_input(body, make_input(**held), world, DT)
	return body


@pytest.mark.parametrize("cell", ["1", "D", " "])
def test_wall_closed_door_and_space_block(cell):
	world = world_from("11111", f"10{cell}01", "11111")
	body = walk(EAST, world, 1.0, up=True)
	assert 1.5 < body.x <= 2 - PLAYER_RADIUS


@pytest.mark.parametrize("cell", ["0", "O", "K"])
def test_open_door_and_pickups_do_not_block(cell):
	world = world_from("11111", f"10{cell}01", "11111")
	body = walk(EAST, world, 1.0, up=True)
	assert body.x > 3


def test_player_slides_along_a_wall():
	# encostado na parede do norte, andando para o nordeste: o y trava e o x anda
	start = Body(x=10.5, y=1.06, angle=0.0)
	body = walk(start, open_world(), 0.5, up=True, right=True)
	assert body.y == start.y
	assert body.x == pytest.approx(start.x + 0.5 * PLAYER_SPEED / math.sqrt(2), abs=TOLERANCE)


@pytest.mark.parametrize("angle", [0.0, math.pi / 2, math.pi, -math.pi / 2])
def test_player_never_leaves_the_grid(angle):
	# um Grid sem parede em volta: a borda precisa bloquear sozinha
	world = world_from("00", "00")
	body = walk(Body(x=0.5, y=0.5, angle=angle), world, 1.0, up=True, sprint=True)
	assert PLAYER_RADIUS <= body.x <= 2 - PLAYER_RADIUS
	assert PLAYER_RADIUS <= body.y <= 2 - PLAYER_RADIUS


def test_grid_with_short_rows_blocks_past_the_end():
	world = world_from("000", "0")
	body = walk(Body(x=0.5, y=1.5, angle=math.pi / 2), world, 1.0, up=True)
	assert body.x <= 1 - PLAYER_RADIUS


def test_player_crosses_a_one_cell_corridor_without_sticking():
	# o ângulo empurra o Player contra a parede do sul; ele desliza e segue pelo corredor
	world = world_from("1111111", "1000001", "1111111")
	start = Body(x=1.5, y=1.5, angle=math.pi / 2 + 0.3)
	body = walk(start, world, 1.0, up=True)
	assert body.x == pytest.approx(start.x + PLAYER_SPEED * math.cos(0.3), abs=TOLERANCE)
	assert start.y < body.y <= 2 - PLAYER_RADIUS
