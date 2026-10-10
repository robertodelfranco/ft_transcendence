import re
from pathlib import Path

import pytest

from app.game import rules

CONTRACT = Path(__file__).resolve().parents[3] / "docs" / "contracts" / "rules.md"
# primeira célula de uma linha de tabela: | `NOME` | ...
ROW_NAME = re.compile(r"^\| `([A-Z][A-Z0-9_]*)` \|", re.MULTILINE)


def contract_names() -> tuple[set[str], set[str]]:
	text = CONTRACT.read_text(encoding="utf-8")
	section = text.split("\n## 2. Formas", 1)[1].split("\n## 3. ", 1)[0]
	common, rest = section.split("\n### 2.6 ", 1)
	per_ruleset = rest.split("\n### 2.7 ", 1)[0]
	return set(ROW_NAME.findall(common)), set(ROW_NAME.findall(per_ruleset))


def test_contract_was_parsed():
	common, per_ruleset = contract_names()
	assert "TICK_RATE" in common
	assert "MANA_MAX" in per_ruleset


def test_common_constants_match_contract():
	common, _ = contract_names()
	in_code = {name for name in vars(rules) if name.isupper()} - {"RULESET_NUMBERS"}
	assert in_code == common


@pytest.mark.parametrize("mode", ["coop", "pvp"])
def test_ruleset_numbers_match_contract(mode):
	_, per_ruleset = contract_names()
	assert set(rules.RULESET_NUMBERS[mode]) == per_ruleset


def test_both_modes_have_the_same_keys():
	assert set(rules.RULESET_NUMBERS) == {"coop", "pvp"}
	assert set(rules.RULESET_NUMBERS["coop"]) == set(rules.RULESET_NUMBERS["pvp"])