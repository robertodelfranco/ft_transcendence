# A porta da Simulation: o resto do backend importa só daqui.
# Não importar rooms.py, protocol.py nem router.py neste arquivo (backend/README.md).
from app.game.rules import TICK_RATE
from app.game.sim import (create_room, enqueue, last_input_seq, leave, match_outcome,
	set_connected, step)
from app.game.snapshot import initial_grid, to_snapshot
from app.game.state import (Action, ActionKind, Event, Input, MatchOutcome, Mode, PickupOptions,
	PlayerOutcome, Room, RoomOptions)
from app.game.world import InvalidMapError, Map, MapNotFoundError, load_map

__all__ = [
	"TICK_RATE",
	"load_map", "create_room", "enqueue", "set_connected", "leave", "step",
	"to_snapshot", "initial_grid", "last_input_seq", "match_outcome",
	"Action", "ActionKind", "Event", "Input", "MatchOutcome", "Mode", "PickupOptions",
	"PlayerOutcome", "Room", "RoomOptions",
	"InvalidMapError", "Map", "MapNotFoundError",
]
