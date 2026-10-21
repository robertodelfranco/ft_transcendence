import json
import subprocess
import sys
from pathlib import Path

import pytest

from app.game.rules import PLAYER_SPEED, TICK_RATE


BACKEND = Path(__file__).resolve().parents[2]
EXAMPLE = BACKEND.parent / "docs/contracts/snapshot.example.json"


def run_cli(tmp_path, *arguments):
	return subprocess.run(
		[
			sys.executable, "-m", "app.game.cli",
			"--output", str(tmp_path / "snapshot.json"),
			*arguments,
		],
		cwd=BACKEND,
		capture_output=True,
		text=True,
		timeout=15,
	)


def generate(tmp_path, *arguments):
	result = run_cli(tmp_path, *arguments)
	assert result.returncode == 0, result.stderr
	return json.loads((tmp_path / "snapshot.json").read_text(encoding="utf-8"))


def assert_contract_keys(actual, example):
	if isinstance(example, dict):
		assert isinstance(actual, dict)
		assert actual.keys() == example.keys()
		for key in example:
			assert_contract_keys(actual[key], example[key])
	elif isinstance(example, list):
		assert isinstance(actual, list)
		if example:
			for element in actual:
				assert_contract_keys(element, example[0])


@pytest.mark.parametrize("ticks", [0, 30])
def test_output_matches_contract_and_requested_tick(tmp_path, ticks):
	document = generate(tmp_path, "--ticks", str(ticks))
	example = json.loads(EXAMPLE.read_text(encoding="utf-8"))
	assert_contract_keys(document, example)
	assert document["welcome"]["type"] == "welcome"
	assert document["welcome"]["v"] == 1
	assert document["welcome"]["snapshot"]["tick"] == 0
	assert document["welcome"]["snapshot"]["last_input_seq"] == 0
	assert document["snapshot"]["type"] == "snapshot"
	assert document["snapshot"]["v"] == 1
	assert document["snapshot"]["tick"] == ticks
	assert document["snapshot"]["last_input_seq"] == ticks


def test_each_player_moves_by_one_fixed_tick(tmp_path):
	document = generate(tmp_path, "--ticks", "1", "--keys", "up")
	initial = document["welcome"]["snapshot"]["players"]
	final = document["snapshot"]["players"]
	assert len(initial) == len(final) == 5
	for before, after in zip(initial, final):
		distance = PLAYER_SPEED / TICK_RATE
		assert after["id"] == before["id"]
		assert after["connected"] is True
		assert after["x"] == pytest.approx(before["x"] + before["dx"] * distance)
		assert after["y"] == pytest.approx(before["y"] + before["dy"] * distance)


def test_empty_keys_leave_one_player_still(tmp_path):
	document = generate(
		tmp_path, "--ticks", "30", "--players", "1", "--keys",
	)
	[before] = document["welcome"]["snapshot"]["players"]
	[after] = document["snapshot"]["players"]
	assert (after["x"], after["y"]) == (before["x"], before["y"])
	assert document["snapshot"]["last_input_seq"] == 30


def test_same_arguments_produce_identical_files(tmp_path):
	arguments = ("--ticks", "30", "--seed", "42", "--keys", "up", "rot_right")
	generate(tmp_path, *arguments)
	first = (tmp_path / "snapshot.json").read_bytes()
	generate(tmp_path, *arguments)
	assert (tmp_path / "snapshot.json").read_bytes() == first


@pytest.mark.parametrize("arguments", [
	("--ticks", "-1"),
	("--ticks", "invalid"),
	("--players", "0"),
	("--players", "6"),
	("--keys", "jump"),
	("--map", "missing_map"),
	("--output", "missing_directory/snapshot.json"),
])
def test_invalid_request_exits_cleanly(tmp_path, arguments):
	# O caminho relativo inválido fica dentro do diretório temporário.
	arguments = tuple(
		str(tmp_path / value) if value.startswith("missing_directory/") else value
		for value in arguments
	)
	result = run_cli(tmp_path, *arguments)
	assert result.returncode == 2
	assert "error:" in result.stderr
	assert "Traceback" not in result.stderr
	assert not (tmp_path / "snapshot.json").exists()
