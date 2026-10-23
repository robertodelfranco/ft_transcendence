"""Registro das Rooms vivas (rooms.md §2.2): o Lobby em memória e a task do tick de cada partida.

Tudo roda num único event loop (um worker só, arq. §2) e nenhum método público síncrono tem
`await`: conferir uma vaga e ocupá-la acontece sem ninguém no meio (arq. §10.1). Há uma
instância por processo, criada no `create_app()` e entregue por `get_room_manager`.
"""
import asyncio
import contextvars
import logging
import math
import random
import time
from collections.abc import Awaitable, Callable
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Literal

from starlette.requests import HTTPConnection

from app.game import (BOSS_DYING_S, TICK_RATE, Event, Map, MatchOutcome, Mode, Room, RoomOptions,
	create_room, last_input_seq, leave, load_map, match_outcome, set_connected, step, to_snapshot)
from app.game.protocol import CloseCode, encode_event, options_payload, snapshot_encoder
from app.matches.results import AchievementUnlock, abort_unfinished, record_match_result
from app.ws.manager import ConnectionManager


log = logging.getLogger(__name__)

RoomStatus = Literal["lobby", "running", "finished", "aborted"]
MapLoader = Callable[[str, Mode], Map]
TickObserver = Callable[[float], None]
RecordResult = Callable[[int, MatchOutcome, datetime], Awaitable[list[AchievementUnlock]]]
AbortMatch = Callable[[int], Awaitable[int]]

MIN_PLAYERS = {Mode.COOP: 1, Mode.PVP: 2} # rooms.md "Em aberto" 3
MAX_PLAYERS = {Mode.COOP: 5, Mode.PVP: 2}
SNAPSHOT_EVERY = 2 # Ticks: 15 Hz (ws-messages.md §2.8)
MAX_STEP_FAILURES = TICK_RATE # falhas sem um ciclo bom no meio: a Room fecha com 4503
DYING_TICKS = math.ceil(BOSS_DYING_S * TICK_RATE) # depois do game_over, só a animação do Boss anda
ROOM_TTL_S = 60 # a Room some 60 s depois do fim (arq. §10.1)
GRACE_PERIOD_S = 30 # ws-messages.md §2.8
GRACE_TICKS = GRACE_PERIOD_S * TICK_RATE # contado em Ticks: o prazo anda com a partida


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
	grace: dict[int, int] = field(default_factory=dict) # user_id → Tick em que o Grace period expira


def now() -> datetime:
	return datetime.now(timezone.utc)


class RoomManager:
	def __init__(self, connections: ConnectionManager, *, load: MapLoader = load_map,
			on_tick: TickObserver = lambda seconds: None, record: RecordResult = record_match_result,
			abort: AbortMatch = abort_unfinished) -> None:
		self._connections = connections
		self._load = load # o teste troca pelos próprios mapas
		self._on_tick = on_tick # duração de cada Tick, para o game_tick_seconds
		self._record = record # o banco do fim de partida (rooms.md §2.5); o teste troca por um fake
		self._abort_match = abort
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
		# o Player nasce desconectado: quem nunca abre o socket expira contando daqui (ws-messages.md)
		entry.grace = {user_id: GRACE_TICKS for user_id in entry.seats}
		entry.status = "running"
		entry.started_at = now()
		# contexto vazio: a task vive a partida inteira e não pode levar o request_id do POST /start
		entry.task = asyncio.create_task(self._run(entry), name=f"room-{match_id}",
			context=contextvars.Context())

	# ---------- socket do jogo (arq. §7.3) ----------

	def player_connected(self, match_id: int, user_id: int) -> None:
		"""Um join aceito no /ws/game: o Player volta e o Grace period dele para."""
		entry = self._entry(match_id)
		set_connected(entry.room, user_id, True)
		entry.grace.pop(user_id, None)

	def player_disconnected(self, match_id: int, user_id: int) -> None:
		"""O socket caiu: começa o Grace period. Não é erro se a Room já foi removida."""
		entry = self._entries.get(match_id)
		if entry is None or entry.room is None:
			return
		set_connected(entry.room, user_id, False)
		if entry.status == "running": # depois do game_over não há o que esperar
			entry.grace[user_id] = entry.room.tick + GRACE_TICKS

	# ---------- leitura ----------

	def info(self, match_id: int) -> RoomInfo:
		return self._info(self._entry(match_id))

	def running_count(self) -> int:
		"""Rooms com o tick rodando, para o `game_rooms_active`."""
		return sum(entry.status == "running" for entry in self._entries.values())

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
		healthy = 0 # Ticks bons seguidos desde a última falha
		next_tick = time.monotonic()
		end_tick: int | None = None # o game_over mais a animação do Boss, que o cliente espera ver
		while end_tick is None or room.tick < end_tick:
			started = time.perf_counter()
			try:
				if end_tick is None:
					# antes do step: o player_left e o game_over por forfeit saem no mesmo Tick
					self._expire_grace(entry)
				await self._send(room, step(room, dt))
			except Exception:
				failures += 1
				healthy = 0
				log.exception("tick failed", extra={"match_id": room.match_id, "failures": failures})
				if failures >= MAX_STEP_FAILURES:
					await self._abort(entry)
					return
			else:
				# só o trabalho, sem o sleep: é o que se compara com o orçamento de 33 ms
				self._on_tick(time.perf_counter() - started)
				# só zera depois de um ciclo inteiro, com Snapshot: um Tick ímpar bom não prova nada
				healthy += 1
				if healthy >= SNAPSHOT_EVERY:
					failures = 0
			if end_tick is None and room.result is not None:
				end_tick = room.tick + DYING_TICKS
				await self._finish(entry)
			# o próximo Tick é marcado a partir do anterior, não de agora: o atraso não acumula
			next_tick += dt
			await asyncio.sleep(max(0.0, next_tick - time.monotonic()))
		await asyncio.sleep(ROOM_TTL_S) # até lá, quem reconecta ainda vê o estado final
		del self._entries[entry.match_id]

	async def _finish(self, entry: Entry) -> None:
		"""game_over: libera os Players e grava o Match uma vez só (rooms.md §2.5)."""
		# liberado já: quem volta ao lobby pela tela de fim não pode levar 409 already_in_other_match
		entry.status = "finished"
		self._release(entry)
		room = entry.room
		try:
			unlocks = await self._record(entry.match_id, match_outcome(room), now())
		except Exception: # sem retry: o Match fica running e o próximo startup o aborta
			log.exception("match result not recorded", extra={"match_id": entry.match_id})
			return
		recipients = [user_id for user_id, player in room.players.items() if not player.left]
		for unlock in unlocks:
			event = Event("achievement_unlocked", room.tick, asdict(unlock))
			await self._connections.broadcast(recipients, encode_event(event), "game")

	def _expire_grace(self, entry: Entry) -> None:
		"""Grace period vencido: o Player sai de vez e o User fica livre para outra Room."""
		for user_id, deadline in list(entry.grace.items()):
			if entry.room.tick >= deadline:
				del entry.grace[user_id]
				leave(entry.room, user_id)
				if self._room_of.get(user_id) == entry.match_id:
					del self._room_of[user_id]

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
		try:
			await self._abort_match(entry.match_id)
		except Exception: # o próximo startup aborta o que sobrou
			log.exception("match abort not recorded", extra={"match_id": entry.match_id})

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
