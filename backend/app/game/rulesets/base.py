from typing import Protocol

from app.game.state import Event, Player, Room


class Ruleset(Protocol):
	# o que muda entre coop e pvp; o step não sabe qual Mode está rodando
	numbers: dict[str, float | None] # RULESET_NUMBERS do Mode

	def on_start(self, room: Room) -> None: ...

	def on_player_death(self, room: Room, player: Player, events: list[Event]) -> None: ...

	def on_tick(self, room: Room, events: list[Event]) -> None: ...

	def check_end(self, room: Room) -> dict | None: ... # o data do game_over, None se a partida segue
