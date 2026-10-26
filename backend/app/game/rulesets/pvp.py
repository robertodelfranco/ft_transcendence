import math

from app.game.rules import BODY_BLOCK_DISTANCE, RULESET_NUMBERS, TICK_RATE
from app.game.state import Event, Mode, Player, Room

RESPAWN_TICKS = round(RULESET_NUMBERS[Mode.PVP]["RESPAWN_DELAY_S"] * TICK_RATE)


class PvpRuleset:
	numbers = RULESET_NUMBERS[Mode.PVP]

	def on_start(self, room: Room) -> None:
		pass

	def on_player_death(self, room: Room, player: Player, events: list[Event]) -> None:
		player.respawn_at_tick = room.tick + RESPAWN_TICKS

	def on_tick(self, room: Room, events: list[Event]) -> None:
		for player in room.players.values():
			if player.left or player.alive or player.respawn_at_tick is None:
				continue
			if room.tick < player.respawn_at_tick:
				continue
			opponents = [other for other in room.players.values()
				if other is not player and other.alive and not other.left]

			def distance(point: tuple[float, float]) -> float:
				return min((math.hypot(point[0] - other.x, point[1] - other.y)
					for other in opponents), default=math.inf)

			free = [point for point in room.spawn_points
				if distance(point) >= BODY_BLOCK_DISTANCE]
			if not free:
				continue
			player.x, player.y = max(free, key=distance)
			player.hp = room.options.start_hp
			player.mana = float(room.numbers["MANA_MAX"])
			player.armor = 0
			player.alive = True
			player.respawn_at_tick = None
			events.append(Event("player_respawned", room.tick,
				{"player_id": player.user_id, "x": player.x, "y": player.y}))

	def check_end(self, room: Room) -> dict | None:
		# Frag do Tick atual prevalece sobre o relógio e a saída simultânea.
		for player in room.players.values():
			if player.frags >= room.options.frag_limit:
				return {"result": "win", "winner_ids": [player.user_id], "reason": "frag_limit"}
		if any(player.left for player in room.players.values()):
			remaining = [player.user_id for player in room.players.values() if not player.left]
			return {"result": "win" if remaining else "draw",
				"winner_ids": remaining, "reason": "forfeit"}
		if room.tick >= room.options.time_limit_s * TICK_RATE:
			highest = max(player.frags for player in room.players.values())
			leaders = [player.user_id for player in room.players.values()
				if player.frags == highest]
			winner_ids = leaders if len(leaders) == 1 else []
			return {"result": "win" if winner_ids else "draw",
				"winner_ids": winner_ids, "reason": "time_limit"}
		return None
