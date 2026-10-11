# backend/tests/game/test_world.py
from app.game.state import Mode
from app.game.world import Map


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
