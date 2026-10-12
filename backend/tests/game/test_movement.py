# backend/tests/game/test_movement.py
import math

import pytest

from app.game.movement import Body, CollisionWorld, apply_input
from app.game.rules import MOUSE_MAX_ROT_SPEED, PLAYER_ROT_SPEED, TICK_RATE
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
