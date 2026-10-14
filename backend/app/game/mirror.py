"""Gera o arquivo que o vitest compara com o rules.ts e o applyInput.ts (roadmap R5).

Rode da pasta backend/:  python -m app.game.mirror
"""
import json
from pathlib import Path

from app.game import rules


MIRROR_FILE = Path(__file__).resolve().parents[3] / "frontend/game/fixtures/mirror.json"


def rule_values() -> dict[str, object]:
	# toda constante em maiúsculas de rules.py, inclusive RULESET_NUMBERS
	return {name: value for name, value in vars(rules).items() if name.isupper()}


def build() -> dict[str, object]:
	return {"rules": rule_values()} # os casos de movimento entram no R5.2


def render(data: dict[str, object]) -> str:
	# sort_keys e indent fixos: gerar duas vezes dá o mesmo texto, byte a byte
	return json.dumps(data, indent=2, sort_keys=True) + "\n"


if __name__ == "__main__":
	MIRROR_FILE.write_text(render(build()))
