# backend/tests/game/test_world.py
import re
import pytest
from pathlib import Path

from app.game.state import Mode
from app.game.world import (MAP_NAME, MAPS_DIR, InvalidMapError, Map, MapCheck,
	MapNotFoundError, Spawn, check_map, load_map, parse_map)


CONTRACT = Path(__file__).resolve().parents[3] / "docs" / "contracts" / "map-format.md"
FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "maps"
FIXTURE_FILES = sorted(FIXTURES.glob("*/*.txt"))


def contract_example() -> tuple[str, tuple[str, ...]]:
	# os dois blocos de map-format.md §3: o arquivo e o grid que o carregador entrega
	text = CONTRACT.read_text(encoding="utf-8")
	section = text.split("\n## 3. Exemplo", 1)[1].split("\n## 4. ", 1)[0]
	source, grid = re.findall(r"```text\n(.*?)```", section, re.DOTALL)
	return source, tuple(grid.splitlines())


def test_every_check_has_a_fixture():
	assert {path.stem for path in FIXTURE_FILES} == {check.value for check in MapCheck}


@pytest.mark.parametrize("path", FIXTURE_FILES, ids=lambda path: path.stem)
def test_fixture_fails_only_its_own_check(path):
	problems = check_map(path.read_text(encoding="utf-8"), Mode(path.parent.name))
	assert {problem.check for problem in problems} == {MapCheck(path.stem)}


def test_contract_example_has_no_problems():
	source, _ = contract_example()
	assert check_map(source, Mode.COOP) == []


def example_map() -> Map:
	source, _ = contract_example()
	return parse_map(source, "example", Mode.COOP)


def test_example_matches_the_contract():
	_, expected_grid = contract_example()
	game_map = example_map()
	assert game_map.grid == expected_grid
	assert len(game_map.spawns) == 5
	assert game_map.enemies == ((4.5, 4.5), (8.5, 4.5), (9.5, 6.5))
	assert game_map.boss == (5.5, 6.5)
	assert game_map.doors == ((6, 3),)


def test_spawn_letter_gives_the_direction():
	assert example_map().spawns == (
		Spawn(1.5, 1.5, 0.0, -1.0), # N
		Spawn(3.5, 1.5, 0.0, 1.0), # S
		Spawn(5.5, 1.5, 1.0, 0.0), # E
		Spawn(7.5, 1.5, -1.0, 0.0), # W
		Spawn(9.5, 1.5, 0.0, -1.0), # N
	)


def test_grid_is_rectangular_without_entity_letters():
	game_map = parse_map("11111\n1NIB1\n111\n", "t", Mode.COOP)
	assert game_map.grid == ("11111", "10001", "111  ")


def test_spawns_come_in_reading_order():
	# N está na linha 1 e coluna 2; S na linha 2 e coluna 1
	game_map = parse_map("1111\n10N1\n1S01\n1111\n", "t", Mode.COOP)
	assert game_map.spawns == (Spawn(2.5, 1.5, 0.0, -1.0), Spawn(1.5, 2.5, 0.0, 1.0))


def small_map() -> Map:
	return Map(name="t", mode=Mode.COOP, grid=("111", "1K1", "111"),
		spawns=(), enemies=(), boss=None, doors=())


def test_room_grid_is_a_copy_of_the_map_grid():
	game_map = small_map()
	grid_a = game_map.new_grid()
	grid_b = game_map.new_grid()
	grid_a[1][1] = "0"
	assert game_map.grid[1][1] == "K"
	assert grid_b[1][1] == "K"


def test_load_map_reads_checks_and_parses(tmp_path):
	source, _ = contract_example()
	(tmp_path / "coop").mkdir()
	(tmp_path / "coop" / "example.txt").write_text(source, encoding="utf-8")
	game_map = load_map("example", Mode.COOP, maps_dir=tmp_path)
	assert game_map == parse_map(source, "example", Mode.COOP)


def test_load_map_refuses_a_missing_map(tmp_path):
	with pytest.raises(MapNotFoundError):
		load_map("nope", Mode.COOP, maps_dir=tmp_path)


def test_load_map_refuses_a_name_that_leaves_the_folder(tmp_path):
	# o arquivo existe em coop/; o nome tenta alcançá-lo a partir de pvp/
	source, _ = contract_example()
	(tmp_path / "coop").mkdir()
	(tmp_path / "pvp").mkdir()
	(tmp_path / "coop" / "example.txt").write_text(source, encoding="utf-8")
	with pytest.raises(MapNotFoundError):
		load_map("../coop/example", Mode.PVP, maps_dir=tmp_path)


def test_load_map_refuses_a_map_with_problems():
	# as fixtures têm a mesma estrutura de pastas dos mapas reais
	with pytest.raises(InvalidMapError):
		load_map("open_border", Mode.COOP, maps_dir=FIXTURES)


def test_real_maps_pass_every_check():
	failures = {}
	for path in sorted(MAPS_DIR.glob("*/*.txt")):
		problems = check_map(path.read_text(encoding="utf-8"), Mode(path.parent.name))
		details = [problem.detail for problem in problems]
		if not MAP_NAME.fullmatch(path.stem):
			details.append("nome do arquivo fora de [a-z0-9_]+")
		if details:
			failures[f"{path.parent.name}/{path.name}"] = details
	assert failures == {}

