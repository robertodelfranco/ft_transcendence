import math

from app.game.rules import TICK_RATE
from app.game.state import Mode, Room


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
		"scoreboard": _scoreboard(room),
	}


def _scoreboard(room: Room) -> dict | None:
	if room.mode != Mode.PVP:
		return None
	# Depois do game_over a Room continua avançando para terminar as animações.
	end_tick = room.outcome.duration_ticks if room.outcome is not None else room.tick
	remaining_ticks = max(0, room.options.time_limit_s * TICK_RATE - end_tick)
	return {
		"players": [{"id": player.user_id, "frags": player.frags}
			for player in sorted(room.players.values(), key=lambda player: -player.frags)],
		"time_left_s": (remaining_ticks + TICK_RATE - 1) // TICK_RATE,
	}


def initial_grid(room: Room) -> list[str]:
	return list(room.initial_grid)
