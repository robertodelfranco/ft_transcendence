"""Registro das Rooms vivas (rooms.md §2.2): o Lobby em memória e a task do tick de cada partida.

Tudo roda num único event loop (um worker só, arq. §2) e nenhum método público síncrono tem
`await`: conferir uma vaga e ocupá-la acontece sem ninguém no meio (arq. §10.1). Há uma
instância por processo, criada no `create_app()` e entregue por `get_room_manager`.
"""
import asyncio
import logging
import random
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Literal

from starlette.requests import HTTPConnection

from app.game import (TICK_RATE, Event, Map, Mode, Room, RoomOptions, create_room, last_input_seq,
	load_map, step, to_snapshot)
from app.game.protocol import CloseCode, encode_event, options_payload, snapshot_encoder
from app.ws.manager import ConnectionManager


log = logging.getLogger(__name__)

RoomStatus = Literal["lobby", "running", "finished", "aborted"]
MapLoader = Callable[[str, Mode], Map]

MIN_PLAYERS = {Mode.COOP: 1, Mode.PVP: 2} # rooms.md "Em aberto" 3
MAX_PLAYERS = {Mode.COOP: 5, Mode.PVP: 2}
SNAPSHOT_EVERY = 2 # Ticks: 15 Hz (ws-messages.md §2.8)
MAX_STEP_FAILURES = TICK_RATE # 1 s seguido sem Simulation: a Room fecha com 4503


# ---------- recusas (rooms.md §2.2) ----------

class RoomError(Exception):
	"""Base das recusas; a rota responde com `status_code` e `code` (matches-api.md §2)."""

	status_code = 409
	code: str


class RoomNotFound(RoomError):
	status_code = 404
	code = "match_not_found"


class RoomFull(RoomError):
	code = "room_full"


class AlreadyIn(RoomError):
	code = "already_in"


class AlreadyInOtherMatch(RoomError):
	code = "already_in_other_match"


class NotInRoom(RoomError):
	code = "not_in_match"


class AlreadyStarted(RoomError):
	code = "already_started"


class NotEnoughPlayers(RoomError):
	code = "not_enough_players"


# ---------- RoomInfo (rooms.md §2.3) ----------

def iso(moment: datetime) -> str:
	return moment.isoformat(timespec="milliseconds").replace("+00:00", "Z")


@dataclass(frozen=True, slots=True)
class PlayerInfo:
	user_id: int
	username: str
	avatar_url: str
	ready: bool
	connected: bool # false durante o Grace period
	joined_at: datetime


@dataclass(frozen=True, slots=True)
class RoomInfo:
	match_id: int
	mode: Mode
	map: str
	max_players: int
	min_players: int
	status: RoomStatus
	created_by: int # o host atual
	options: RoomOptions
	created_at: datetime
	players: tuple[PlayerInfo, ...] # em ordem de entrada

	def to_payload(self) -> dict[str, Any]:
		"""O corpo de matches-api.md e o `room` do lobby_update; os dois saem daqui."""
		return {
			"match_id": self.match_id, "mode": self.mode, "map": self.map,
			"max_players": self.max_players, "min_players": self.min_players,
			"status": self.status, "created_by": self.created_by,
			"options": options_payload(self.mode, self.options),
			"created_at": iso(self.created_at),
			"players": [{"user_id": p.user_id, "username": p.username, "avatar_url": p.avatar_url,
				"ready": p.ready, "connected": p.connected, "joined_at": iso(p.joined_at)}
				for p in self.players],
		}


# ---------- estado interno ----------

@dataclass(slots=True)
class Seat:
	username: str
	avatar_url: str
	joined_at: datetime
	ready: bool = False # vive aqui, nunca no banco (rooms.md decisão 2)


@dataclass(slots=True)
class Entry:
	match_id: int
	mode: Mode
	game_map: Map
	max_players: int
	options: RoomOptions
	created_by: int
	created_at: datetime
	status: RoomStatus = "lobby"
	seats: dict[int, Seat] = field(default_factory=dict) # user_id → Seat, em ordem de entrada
	room: Room | None = None # a Room da Simulation nasce no start
	task: asyncio.Task[None] | None = None
	started_at: datetime | None = None


def now() -> datetime:
	return datetime.now(timezone.utc)


class RoomManager:
	def __init__(self, connections: ConnectionManager, *, load: MapLoader = load_map) -> None:
		self._connections = connections
		self._load = load # o teste troca pelos próprios mapas
		self._entries: dict[int, Entry] = {}
		self._room_of: dict[int, int] = {} # user_id → match_id, enquanto lobby ou running

	# ---------- Lobby ----------

	def create(self, match_id: int, mode: Mode, map_name: str, max_players: int,
			options: RoomOptions, created_by: int) -> None:
		"""A Room nasce vazia, em lobby e sem task; o lobby chama `join` do criador logo depois."""
		if match_id in self._entries:
			raise ValueError(f"match {match_id} already has a Room")
		game_map = self._load(map_name, mode) # MapNotFoundError/InvalidMapError sobem
		ceiling = min(MAX_PLAYERS[mode], len(game_map.spawns))
		if not MIN_PLAYERS[mode] <= max_players <= ceiling:
			raise ValueError(f"max_players {max_players} outside {MIN_PLAYERS[mode]}..{ceiling}")
		self._entries[match_id] = Entry(match_id=match_id, mode=mode, game_map=game_map,
			max_players=max_players, options=options, created_by=created_by, created_at=now())

	def join(self, match_id: int, user_id: int, username: str, avatar_url: str) -> RoomInfo:
		entry = self._entry(match_id)
		if user_id in entry.seats:
			raise AlreadyIn(f"user {user_id} is already in match {match_id}")
		if (other := self._room_of.get(user_id)) is not None:
			raise AlreadyInOtherMatch(f"user {user_id} is in match {other}")
		self._require_lobby(entry)
		if len(entry.seats) >= entry.max_players:
			raise RoomFull(f"match {match_id} has {len(entry.seats)}/{entry.max_players} players")
		entry.seats[user_id] = Seat(username, avatar_url, now())
		self._room_of[user_id] = match_id
		return self._info(entry)

	def leave(self, match_id: int, user_id: int) -> RoomInfo | None:
		"""None quando era o último: a Room some na mesma chamada (rooms.md decisão 3)."""
		entry = self._entry(match_id)
		self._require_seat(entry, user_id)
		self._require_lobby(entry)
		del entry.seats[user_id]
		del self._room_of[user_id]
		if not entry.seats:
			del self._entries[match_id]
			return None
		if entry.created_by == user_id:
			entry.created_by = next(iter(entry.seats)) # quem entrou primeiro entre os que ficaram
		return self._info(entry)

	def set_ready(self, match_id: int, user_id: int, ready: bool) -> RoomInfo:
		entry = self._entry(match_id)
		self._require_seat(entry, user_id)
		self._require_lobby(entry)
		entry.seats[user_id].ready = ready
		return self._info(entry)

	def start(self, match_id: int) -> None:
		"""Cria a Room da Simulation com os Players em ordem de entrada e liga o tick."""
		entry = self._entry(match_id)
		self._require_lobby(entry)
		minimum = MIN_PLAYERS[entry.mode]
		if len(entry.seats) < minimum:
			raise NotEnoughPlayers(f"match {match_id} has {len(entry.seats)}/{minimum} players")
		players = [(user_id, seat.username) for user_id, seat in entry.seats.items()]
		entry.room = create_room(match_id, entry.mode, entry.game_map, entry.options, players,
			seed=random.randrange(2**32))
		entry.status = "running"
		entry.started_at = now()
		entry.task = asyncio.create_task(self._run(entry), name=f"room-{match_id}")

	# ---------- leitura ----------

	def info(self, match_id: int) -> RoomInfo:
		return self._info(self._entry(match_id))

	def list_open(self) -> list[RoomInfo]:
		return [self._info(entry) for entry in self._entries.values() if entry.status == "lobby"]

	def room_of(self, user_id: int) -> int | None:
		return self._room_of.get(user_id)

	def game_room(self, match_id: int) -> Room | None:
		"""A Room da Simulation, para o /ws/game (F2.4); None se não existe ou ainda está em lobby."""
		entry = self._entries.get(match_id)
		return entry.room if entry is not None else None

	# ---------- desligamento ----------

	async def close(self) -> None:
		"""Cancela a task de toda Room e espera cada uma acabar: nenhuma sobra no shutdown."""
		tasks = [entry.task for entry in self._entries.values()
			if entry.task is not None and not entry.task.done()]
		for task in tasks:
			task.cancel()
		await asyncio.gather(*tasks, return_exceptions=True)

	# ---------- o tick (arq. §6.2) ----------

	async def _run(self, entry: Entry) -> None:
		room = entry.room
		dt = 1 / TICK_RATE
		failures = 0
		next_tick = time.monotonic()
		while room.result is None:
			try:
				await self._send(room, step(room, dt))
				failures = 0
			except Exception:
				failures += 1
				log.exception("step failed", extra={"match_id": room.match_id, "failures": failures})
				if failures >= MAX_STEP_FAILURES:
					await self._abort(entry)
					return
			# o próximo Tick é marcado a partir do anterior, não de agora: o atraso não acumula
			next_tick += dt
			await asyncio.sleep(max(0.0, next_tick - time.monotonic()))
		entry.status = "finished" # gravar o Match e remover a Room 60 s depois é da F2.9
		self._release(entry)

	async def _send(self, room: Room, events: list[Event]) -> None:
		recipients = [user_id for user_id, player in room.players.items() if not player.left]
		for event in events:
			await self._connections.broadcast(recipients, encode_event(event), "game")
		if room.tick % SNAPSHOT_EVERY == 0:
			# serializado uma vez; por destinatário só muda o last_input_seq
			frame_for = snapshot_encoder(to_snapshot(room))
			for user_id in recipients:
				await self._connections.send_to_user(user_id, frame_for(last_input_seq(room, user_id)),
					"game", droppable=True)

	async def _abort(self, entry: Entry) -> None:
		entry.status = "aborted"
		self._release(entry)
		del self._entries[entry.match_id]
		await self._connections.close_match(entry.match_id, CloseCode.SERVER_SHUTDOWN,
			"simulation failed")

	# ---------- auxiliares ----------

	def _entry(self, match_id: int) -> Entry:
		entry = self._entries.get(match_id)
		if entry is None:
			raise RoomNotFound(f"match {match_id} has no Room")
		return entry

	def _require_seat(self, entry: Entry, user_id: int) -> None:
		if user_id not in entry.seats:
			raise NotInRoom(f"user {user_id} is not in match {entry.match_id}")

	def _require_lobby(self, entry: Entry) -> None:
		if entry.status != "lobby":
			raise AlreadyStarted(f"match {entry.match_id} is {entry.status}")

	def _release(self, entry: Entry) -> None:
		# terminada a partida, o User pode entrar em outra (rooms.md decisão 9)
		for user_id in entry.seats:
			if self._room_of.get(user_id) == entry.match_id:
				del self._room_of[user_id]

	def _info(self, entry: Entry) -> RoomInfo:
		room = entry.room
		return RoomInfo(match_id=entry.match_id, mode=entry.mode, map=entry.game_map.name,
			max_players=entry.max_players, min_players=MIN_PLAYERS[entry.mode], status=entry.status,
			created_by=entry.created_by, options=entry.options, created_at=entry.created_at,
			players=tuple(PlayerInfo(user_id=user_id, username=seat.username,
				avatar_url=seat.avatar_url, ready=seat.ready,
				# no Lobby, estar na Room é estar online (rooms.md decisão 10)
				connected=room.players[user_id].connected if room is not None else True,
				joined_at=seat.joined_at) for user_id, seat in entry.seats.items()))


def get_room_manager(connection: HTTPConnection) -> RoomManager:
	"""Dependência do FastAPI; o teste troca a instância por dependency_overrides."""
	return connection.app.state.room_manager
