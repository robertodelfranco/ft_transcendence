import math
from dataclasses import dataclass

from app.game.rules import (MOUSE_MAX_ROT_SPEED, PLAYER_ROT_SPEED, PLAYER_SPEED,
	PLAYER_SPRINT_MULT)
from app.game.state import Input


@dataclass(frozen=True, slots=True)
class Body:
	x: float # cél
	y: float
	angle: float # rad; norte = 0, dx = sin(angle), dy = -cos(angle)


@dataclass(frozen=True, slots=True)
class CollisionWorld:
	grid: list[list[str]] # o Grid atual da Room
	bodies: tuple[tuple[float, float], ...] # centro de cada corpo que bloqueia


def apply_input(body: Body, inp: Input, world: CollisionWorld, dt: float) -> Body:
	# a ordem é contrato (ws-messages.md §2.9) e é a mesma do applyInput.ts
	angle = _turn(body.angle, inp, dt)
	x, y = _walk(body.x, body.y, angle, inp, dt)
	return Body(x, y, angle)


def _turn(angle: float, inp: Input, dt: float) -> float:
	# primeiro o mouse, cortado no limite; depois as teclas
	max_turn = MOUSE_MAX_ROT_SPEED * dt
	angle += max(-max_turn, min(max_turn, inp.mouse_dx))
	angle += (inp.rot_right - inp.rot_left) * PLAYER_ROT_SPEED * dt
	return angle


def _walk(x: float, y: float, angle: float, inp: Input, dt: float) -> tuple[float, float]:
	forward = inp.up - inp.down
	strafe = inp.right - inp.left
	length = math.hypot(forward, strafe)
	if length == 0:
		return x, y
	speed = PLAYER_SPEED * (PLAYER_SPRINT_MULT if inp.sprint else 1.0)
	dir_x, dir_y = math.sin(angle), -math.cos(angle)
	# frente = (dir_x, dir_y); direita = (-dir_y, dir_x)
	move_x = (dir_x * forward - dir_y * strafe) / length
	move_y = (dir_y * forward + dir_x * strafe) / length
	return x + move_x * speed * dt, y + move_y * speed * dt
