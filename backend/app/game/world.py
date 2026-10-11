from dataclasses import dataclass

from app.game.state import Mode


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
