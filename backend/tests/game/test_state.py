import re
from pathlib import Path

import pytest

from app.game import state

CONTRACT = Path(__file__).resolve().parents[3] / "docs" / "contracts" / "ws-messages.md"
ENUMS = {"Enemy": state.EnemyState, "Boss": state.BossState, "Projectile": state.ProjectileState}


def contract_states() -> dict[str, set[str]]:
	text = CONTRACT.read_text(encoding="utf-8")
	section = text.split("\n### 2.5 ", 1)[1].split("\n### 2.6 ", 1)[0]
	# só as linhas depois do separador da tabela (|---|), para pular o cabeçalho
	rows = section.split("|---", 1)[1].splitlines()[1:]
	states: dict[str, set[str]] = {}
	entity = ""
	for line in rows:
		cells = [cell.strip() for cell in line.split("|")]
		if len(cells) < 3 or not re.fullmatch(r"`[a-z]+`", cells[2]):
			continue
		# a coluna da entidade vem vazia nas linhas seguintes da mesma entidade
		entity = cells[1] or entity
		states.setdefault(entity, set()).add(cells[2].strip("`"))
	return states


def test_contract_was_parsed():
	assert contract_states().keys() == ENUMS.keys()


@pytest.mark.parametrize("entity", ENUMS)
def test_state_values_match_contract(entity):
	assert {member.value for member in ENUMS[entity]} == contract_states()[entity]