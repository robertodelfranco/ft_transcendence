from app.game.rules import RULESET_NUMBERS
from app.game.state import Event, Mode, Player, Room


class PvpRuleset:
	# por enquanto só os números; respawn e fim de partida entram no R6
	numbers = RULESET_NUMBERS[Mode.PVP]

	def on_start(self, room: Room) -> None:
		pass

	def on_player_death(self, room: Room, player: Player, events: list[Event]) -> None:
		pass

	def check_end(self, room: Room) -> dict | None:
		return None
