from app.game.rules import RULESET_NUMBERS
from app.game.state import BossState, Event, Mode, Player, Room


class CoopRuleset:
	numbers = RULESET_NUMBERS[Mode.COOP]

	def on_start(self, room: Room) -> None:
		pass # a Mana cheia já sai do create_room

	def on_player_death(self, room: Room, player: Player, events: list[Event]) -> None:
		pass # sem respawn no coop

	def check_end(self, room: Room) -> dict | None:
		# o Boss vem primeiro: Boss e último Player morrendo no mesmo Tick é vitória
		if room.boss is not None and room.boss.state == BossState.DYING:
			# vitória de grupo: entra todo mundo, inclusive quem morreu ou saiu
			return {"result": "win", "winner_ids": sorted(room.players), "reason": "boss_defeated"}
		if not any(player.alive and not player.left for player in room.players.values()):
			return {"result": "loss", "winner_ids": [], "reason": "all_dead"}
		return None
