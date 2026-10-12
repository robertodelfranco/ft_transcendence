import math
from dataclasses import dataclass

from app.game.rules import (MOUSE_MAX_ROT_SPEED, PLAYER_RADIUS, PLAYER_ROT_SPEED,
	PLAYER_SPEED, PLAYER_SPRINT_MULT)
from app.game.state import Input
from app.game.world import SOLID_CHARS


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
	x, y = _walk(body.x, body.y, angle, inp, world, dt)
	return Body(x, y, angle)


def _turn(angle: float, inp: Input, dt: float) -> float:
	# primeiro o mouse, cortado no limite; depois as teclas
	max_turn = MOUSE_MAX_ROT_SPEED * dt
	angle += max(-max_turn, min(max_turn, inp.mouse_dx))
	angle += (inp.rot_right - inp.rot_left) * PLAYER_ROT_SPEED * dt
	return angle


def _walk(x: float, y: float, angle: float, inp: Input, world: CollisionWorld,
		dt: float) -> tuple[float, float]:
	forward = inp.up - inp.down
	strafe = inp.right - inp.left
	length = math.hypot(forward, strafe)
	if length == 0:
		return x, y
	speed = PLAYER_SPEED * (PLAYER_SPRINT_MULT if inp.sprint else 1.0)
	dir_x, dir_y = math.sin(angle), -math.cos(angle)
	# frente = (dir_x, dir_y); direita = (-dir_y, dir_x)
	step_x = (dir_x * forward - dir_y * strafe) / length * speed * dt
	step_y = (dir_y * forward + dir_x * strafe) / length * speed * dt
	# um eixo de cada vez, primeiro o x: bloqueado num, o Player desliza no outro
	if _fits(world, x + step_x, y):
		x += step_x
	if _fits(world, x, y + step_y):
		y += step_y
	return x, y


def _fits(world: CollisionWorld, x: float, y: float) -> bool:
	# os 4 cantos da caixa do Player, a PLAYER_RADIUS do centro
	for corner_x in (x - PLAYER_RADIUS, x + PLAYER_RADIUS):
		for corner_y in (y - PLAYER_RADIUS, y + PLAYER_RADIUS):
			if _is_solid(world.grid, corner_x, corner_y):
				return False
	return True


def _is_solid(grid: list[list[str]], x: float, y: float) -> bool:
	column, row = math.floor(x), math.floor(y)
	# fora do Grid é sólido; sem esta checagem, um índice negativo leria a outra ponta da lista
	if row < 0 or row >= len(grid) or column < 0 or column >= len(grid[row]):
		return True
	return grid[row][column] in SOLID_CHARS
