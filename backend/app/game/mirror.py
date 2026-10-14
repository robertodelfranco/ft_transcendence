"""Gera o arquivo que o vitest compara com o rules.ts e o applyInput.ts (roadmap R5).

Rode da pasta backend/:  python -m app.game.mirror
"""
import json
import random
from pathlib import Path

from app.game import rules
from app.game.movement import Body, CollisionWorld, apply_input
from app.game.state import Input


MIRROR_FILE = Path(__file__).resolve().parents[3] / "frontend/game/fixtures/mirror.json"
DT = 1 / rules.TICK_RATE
KEY_NAMES = ("up", "down", "left", "right", "rot_left", "rot_right", "sprint")

# sala 8x8 com um pilar 2x2 no meio e uma Door fechada na parede de cima
GRID = [
	"111111D1",
	"10000001",
	"10000001",
	"10011001",
	"10011001",
	"10000001",
	"10000001",
	"11111111",
]

# (nome, início (x, y, ângulo), corpos, [(teclas, mouse_dx, Ticks)]); norte = 0, y cresce para o sul
CASES = [
	("walk_straight", (1.5, 6.5, 0.0), [], [(["up"], 0.0, 30)]),
	("sprint", (1.5, 6.5, 0.0), [], [(["up", "sprint"], 0.0, 15)]),
	("diagonal", (1.5, 6.5, 0.0), [], [(["up", "right"], 0.0, 15)]),
	("turn_by_key", (3.5, 6.5, 0.0), [], [(["rot_right"], 0.0, 45), (["rot_left"], 0.0, 10)]),
	("turn_by_mouse_cut", (3.5, 6.5, 0.0), [], [([], 2.0, 5), ([], -0.3, 5), ([], 0.01, 5)]),
	("wall_ahead", (1.5, 2.5, 0.0), [], [(["up"], 0.0, 30)]),
	("slide_along_wall", (1.5, 2.5, -0.6), [], [(["up"], 0.0, 30)]),
	("door_blocks", (6.5, 2.5, 0.0), [], [(["up"], 0.0, 30)]),
	("body_blocks", (5.5, 6.5, 0.0), [(5.5, 5.0)], [(["up"], 0.0, 30)]),
]


def rule_values() -> dict[str, object]:
	# toda constante em maiúsculas de rules.py, inclusive RULESET_NUMBERS
	return {name: value for name, value in vars(rules).items() if name.isupper()}


def random_runs(seed: int, total: int) -> list[tuple[list[str], float, int]]:
	# rng próprio, nunca o random global: gerar de novo dá o mesmo arquivo
	rng = random.Random(seed)
	runs, left = [], total
	while left > 0:
		keys = [name for name in KEY_NAMES if rng.random() < 0.4]
		ticks = min(rng.randint(1, 20), left)
		runs.append((keys, rng.uniform(-1.0, 1.0), ticks))
		left -= ticks
	return runs


def run_case(name: str, start: tuple[float, float, float], bodies: list[tuple[float, float]],
		runs: list[tuple[list[str], float, int]]) -> dict[str, object]:
	world = CollisionWorld(grid=[list(row) for row in GRID], bodies=tuple(bodies))
	body = Body(*start)
	for keys, mouse_dx, ticks in runs:
		inp = Input(seq=0, mouse_dx=mouse_dx, **{key: key in keys for key in KEY_NAMES})
		for _ in range(ticks):
			body = apply_input(body, inp, world, DT)
	return {
		"name": name,
		"start": dict(zip(("x", "y", "angle"), start)),
		"bodies": bodies,
		"runs": [{"keys": keys, "mouse_dx": mouse_dx, "ticks": ticks} for keys, mouse_dx, ticks in runs],
		"end": {"x": body.x, "y": body.y, "angle": body.angle},
	}


def build() -> dict[str, object]:
	cases = [run_case(*case) for case in CASES]
	# 1000 Inputs que batem em parede, pilar, Door e num corpo
	cases.append(run_case("thousand_inputs", (2.5, 2.5, 0.0), [(5.5, 6.0)], random_runs(42, 1000)))
	return {"rules": rule_values(), "dt": DT, "grid": GRID, "cases": cases}


def render(data: dict[str, object]) -> str:
	# sort_keys e indent fixos: gerar duas vezes dá o mesmo texto, byte a byte
	return json.dumps(data, indent=2, sort_keys=True) + "\n"


if __name__ == "__main__":
	MIRROR_FILE.write_text(render(build()))
