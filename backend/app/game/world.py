from dataclasses import dataclass
from enum import StrEnum

from app.game.state import Mode

MAP_CHARS = "10 NSEWDKPMAIBT" # a tabela de map-format.md §2.2
SOLID_CHARS = "1 D" # o que bloqueia: parede, fora do Map e Door
MIN_SPAWNS = { Mode.COOP: 5, Mode.PVP: 2 }
MAX_ENEMIES = 20
SPAWN_DIRECTIONS = {
	"N": (0.0, -1.0),
	"S": (0.0, 1.0),
	"E": (1.0, 0.0),
	"W": (-1.0, 0.0),
}


class MapCheck(StrEnum):
	UNKNOWN_CHAR = "unknown_char" # 1
	OPEN_BORDER = "open_border" # 2
	TOO_FEW_SPAWNS = "too_few_spawns" # 3
	BOSS_COUNT = "boss_count" # 4
	BLANK_OR_CONTROL = "blank_or_control" # 5
	OPEN_DOOR_CHAR = "open_door_char" # 6
	PVP_ENTITY = "pvp_entity" # 7
	DOOR_PLACEMENT = "door_placement" # 8
	TOO_FEW_KEYS = "too_few_keys" # 9
	TOO_MANY_ENEMIES = "too_many_enemies" # 10
	DIAGONAL_CORNER = "diagonal_corner" # 11


@dataclass(frozen=True, slots=True)
class Spawn:
	x: float # centro da célula
	y: float
	dx: float # direção inicial, vetor unitário
	dy: float


@dataclass(frozen=True, slots=True)
class Map:
	name: str
	mode: Mode
	grid: tuple[str, ...] # retangular; Spawn, I e B já viraram 0
	spawns: tuple[Spawn, ...] # em ordem de leitura
	enemies: tuple[tuple[float, float], ...] # centro de cada I
	boss: tuple[float, float] | None # centro do B
	doors: tuple[tuple[int, int], ...] # célula de cada D

	def new_grid(self) -> list[list[str]]:
		# cada Room recebe a sua cópia; o Map é compartilhado e não muda
		return [list(row) for row in self.grid]


@dataclass(frozen=True, slots=True)
class MapProblem:
	check: MapCheck
	detail: str # onde e o quê, para quem escreve o Map


def parse_map(text: str, name: str, mode: Mode) -> Map:
	lines = text.rstrip("\n").split("\n")
	width = max(len(line) for line in lines)
	grid: list[str] = []
	spawns: list[Spawn] = []
	enemies: list[tuple[float, float]] = []
	boss: tuple[float, float] | None = None
	doors: list[tuple[int, int]] = []
	for y, line in enumerate(lines):
		row = list(line.ljust(width))
		for x, char in enumerate(row):
			center = (x + 0.5, y + 0.5)
			if char in SPAWN_DIRECTIONS:
				spawns.append(Spawn(*center, *SPAWN_DIRECTIONS[char]))
			elif char == "I":
				enemies.append(center)
			elif char == "B":
				boss = center
			elif char == "D":
				doors.append((x, y))
			if char in "NSEWIB":
				row[x] = "0"
		grid.append("".join(row))
	return Map(name=name, mode=mode, grid=tuple(grid), spawns=tuple(spawns),
		enemies=tuple(enemies), boss=boss, doors=tuple(doors))


def check_map(text: str, mode: Mode) -> list[MapProblem]:
	lines = text.rstrip("\n").split("\n")
	width = max(len(line) for line in lines)
	grid = [line.ljust(width) for line in lines]
	chars = "".join(lines)
	problems: list[MapProblem] = []

	def cell(x: int, y: int) -> str:
		# fora do Grid vale como espaço
		if 0 <= y < len(grid) and 0 <= x < width:
			return grid[y][x]
		return " "

	def add(check: MapCheck, detail: str) -> None:
		problems.append(MapProblem(check, detail))

	for y, line in enumerate(lines):
		if line == "":
			add(MapCheck.BLANK_OR_CONTROL, f"linha {y} vazia")

	for y, row in enumerate(grid):
		for x, char in enumerate(row):
			where = f"({x}, {y})"
			west, east = cell(x - 1, y), cell(x + 1, y)
			north, south = cell(x, y - 1), cell(x, y + 1)
			# 5, 6 e 1: cada caractere estranho cai numa checagem só
			if not char.isprintable():
				add(MapCheck.BLANK_OR_CONTROL, f"caractere de controle em {where}")
			elif char == "O":
				add(MapCheck.OPEN_DOOR_CHAR, f"O em {where}")
			elif char not in MAP_CHARS:
				add(MapCheck.UNKNOWN_CHAR, f"{char!r} em {where}")
			# 2: célula que não é parede nem espaço encostada em espaço
			if char not in "1 " and " " in (west, east, north, south):
				add(MapCheck.OPEN_BORDER, f"{char!r} em {where} encosta em espaço ou na borda")
			# 8: parede dos dois lados num eixo, e só num
			if char == "D":
				west_east = west == "1" and east == "1"
				north_south = north == "1" and south == "1"
				if west_east == north_south:
					add(MapCheck.DOOR_PLACEMENT, f"Door em {where} não está entre duas paredes opostas")
			# 11: no bloco de 2 x 2 que começa aqui, sólidos numa diagonal e livres na outra
			a, b = char in SOLID_CHARS, east in SOLID_CHARS
			c, d = south in SOLID_CHARS, cell(x + 1, y + 1) in SOLID_CHARS
			if (a and d and not b and not c) or (b and c and not a and not d):
				add(MapCheck.DIAGONAL_CORNER, f"quina diagonal no bloco que começa em {where}")

	spawns = sum(chars.count(letter) for letter in SPAWN_DIRECTIONS)
	if spawns < MIN_SPAWNS[mode]:
		add(MapCheck.TOO_FEW_SPAWNS, f"{spawns} Spawns, o mínimo no {mode} é {MIN_SPAWNS[mode]}")
	if mode == Mode.COOP and chars.count("B") != 1:
		add(MapCheck.BOSS_COUNT, f"{chars.count('B')} Boss, o coop pede exatamente 1")
	if mode == Mode.PVP and ("I" in chars or "B" in chars):
		add(MapCheck.PVP_ENTITY, "I ou B num Map de pvp")
	if chars.count("K") < chars.count("D"):
		add(MapCheck.TOO_FEW_KEYS, f"{chars.count('K')} chaves para {chars.count('D')} Doors")
	if chars.count("I") > MAX_ENEMIES:
		add(MapCheck.TOO_MANY_ENEMIES, f"{chars.count('I')} Enemies, o máximo é {MAX_ENEMIES}")
	return problems
