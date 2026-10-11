import math

from app.game.state import Room


def to_snapshot(room: Room) -> dict:
	# os campos de ws-messages.md §2.4, sem v, type e last_input_seq
	boss = room.boss
	return {
		"tick": room.tick,
		"players": [
			{
				"id": player.user_id, "name": player.name,
				"x": player.x, "y": player.y,
				"dx": math.sin(player.angle), "dy": -math.cos(player.angle),
				"hp": player.hp, "mana": math.floor(player.mana),
				"armor": player.armor, "keys": player.keys,
				"alive": player.alive, "connected": player.connected,
			}
			for player in room.players.values() if not player.left
		],
		"enemies": [
			{"id": enemy.id, "x": enemy.x, "y": enemy.y, "state": enemy.state}
			for enemy in room.enemies
		],
		"boss": None if boss is None else {
			"x": boss.x, "y": boss.y, "hp": boss.hp, "state": boss.state,
		},
		"projectiles": [
			{
				"id": shot.id, "kind": shot.kind, "owner": shot.owner_id,
				"x": shot.x, "y": shot.y, "dx": shot.dx, "dy": shot.dy, "state": shot.state,
			}
			for shot in room.projectiles
		],
		"doors": [
			{"x": door.x, "y": door.y, "open": door.open, "locked": door.locked}
			for door in room.doors
		],
		"grid_delta": [
			{"x": x, "y": y, "c": char}
			for y, row in enumerate(room.grid)
			for x, char in enumerate(row)
			if char != room.initial_grid[y][x]
		],
		"scoreboard": None, # o placar do pvp entra no R6
	}


def initial_grid(room: Room) -> list[str]:
	return list(room.initial_grid)
