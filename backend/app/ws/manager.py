"""Registro único dos sockets abertos por User (ws-manager.md §2).

Cada socket vira uma `Connection`, com a própria fila de envio e a única task que escreve nele:
quem manda mensagem só enfileira e nunca espera a rede. Há uma instância por processo
(um worker só, arq. §2), criada no `create_app()` e entregue por `get_connection_manager`.
"""
import asyncio
import logging
from collections import deque
from collections.abc import Awaitable, Callable, Iterable, Iterator, Mapping
from typing import Any, Literal, Protocol

from starlette.requests import HTTPConnection

from app.game.protocol import CloseCode, encode_error, to_json


log = logging.getLogger(__name__)

Channel = Literal["app", "game"]
CHANNELS: tuple[Channel, ...] = ("app", "game")
PresenceCallback = Callable[[int, bool], Awaitable[None]]
Message = Mapping[str, Any] | str # dict é serializado aqui; str já vem pronto (o Snapshot)

NORMAL_CLOSURE = 1000
SEND_QUEUE_MAX = 256 # mensagens não descartáveis esperando; acima disso, 4429
PRESENCE_OFFLINE_DELAY_S = 5.0 # recarregar a página não pode piscar offline para os amigos
CLOSE_TIMEOUT_S = 1.0 # quanto o fechamento espera um socket travado


class Socket(Protocol):
	"""O que o manager usa do WebSocket do Starlette; o `fake_ws` dos testes cumpre o mesmo."""

	async def send_text(self, data: str) -> None: ...
	async def close(self, code: int = NORMAL_CLOSURE, reason: str | None = None) -> None: ...


def to_text(message: Message) -> str:
	return message if isinstance(message, str) else to_json(message)


class Connection:
	"""Um socket aberto: a fila de envio e a única task que escreve nele (§2.7)."""

	def __init__(self, user_id: int, channel: Channel, ws: Socket, match_id: int | None, *,
			queue_max: int, close_timeout_s: float,
			on_lost: Callable[["Connection"], Awaitable[None]]) -> None:
		self.user_id = user_id
		self.channel = channel
		self.match_id = match_id
		self._ws = ws
		self._queue_max = queue_max
		self._close_timeout_s = close_timeout_s
		self._on_lost = on_lost
		self._pending: deque[tuple[str, bool]] = deque() # (texto, descartável)
		self._urgent = 0 # quantas da fila não podem ser descartadas
		self._wakeup = asyncio.Event()
		self._closed = False
		self._writer = asyncio.create_task(self._write_loop(), name=f"ws-{channel}-{user_id}")

	@property
	def closed(self) -> bool:
		return self._closed

	def push(self, text: str, droppable: bool) -> bool:
		"""Enfileira sem esperar a rede. False: a fila estourou e o cliente não está lendo."""
		if self._closed:
			return True # já está saindo do registro; perder a mensagem aqui é o esperado
		if droppable:
			# o Snapshot novo toma o lugar do que ainda não saiu: o cliente lento pula os intermediários
			for index, (_, was_droppable) in enumerate(self._pending):
				if was_droppable:
					self._pending[index] = (text, True)
					return True
		elif self._urgent >= self._queue_max:
			return False
		else:
			self._urgent += 1
		self._pending.append((text, droppable))
		self._wakeup.set()
		return True

	async def close(self, code: int = NORMAL_CLOSURE, message: str = "") -> None:
		"""Para a escrita e fecha o socket; antes de um 44xx/4503 manda o error (§2.8). Idempotente."""
		if self._closed:
			return
		self._closed = True
		if self._writer is not asyncio.current_task(): # o próprio writer chega aqui quando o envio falha
			self._writer.cancel()
			await asyncio.wait({self._writer}) # sem engolir um cancelamento de quem chamou
		self._pending.clear()
		if code != NORMAL_CLOSURE:
			await self._best_effort(self._ws.send_text(encode_error(CloseCode(code), message)))
		await self._best_effort(self._ws.close(code))

	async def _best_effort(self, operation: Awaitable[None]) -> None:
		# o socket pode já ter caído, ou estar travado: fechar nunca levanta nem trava o chamador
		try:
			async with asyncio.timeout(self._close_timeout_s):
				await operation
		except Exception: # inclui o TimeoutError do asyncio.timeout
			log.debug("close step failed", extra={"user_id": self.user_id, "channel": self.channel})

	async def _write_loop(self) -> None:
		try:
			while True:
				await self._wakeup.wait()
				while self._pending:
					text, droppable = self._pending.popleft()
					if not droppable:
						self._urgent -= 1
					await self._ws.send_text(text)
				self._wakeup.clear()
		except asyncio.CancelledError:
			raise
		except Exception: # o envio falhou: o socket caiu e o leitor talvez ainda não saiba
			log.debug("send failed", extra={"user_id": self.user_id, "channel": self.channel})
			await self._on_lost(self)


class ConnectionManager:
	def __init__(self, *, offline_delay_s: float = PRESENCE_OFFLINE_DELAY_S,
			send_queue_max: int = SEND_QUEUE_MAX, close_timeout_s: float = CLOSE_TIMEOUT_S) -> None:
		self._offline_delay_s = offline_delay_s
		self._send_queue_max = send_queue_max
		self._close_timeout_s = close_timeout_s
		self._sockets: dict[tuple[int, Channel], set[Connection]] = {}
		self._presence_callbacks: list[PresenceCallback] = []
		self._offline_timers: dict[int, asyncio.Task[None]] = {} # quem ainda não foi anunciado offline
		self._background: set[asyncio.Task[None]] = set()

	# ---------- registro ----------

	async def connect(self, user_id: int, channel: Channel, ws: Socket,
			match_id: int | None = None) -> Connection:
		"""Registra um socket já autenticado (depois do join). No canal game, o novo vence (§2.6)."""
		if channel == "game":
			for old in self._connections(user_id, "game"):
				await self.disconnect(old, CloseCode.REPLACED, "replaced by a newer connection")
		was_online = self.is_online(user_id)
		connection = Connection(user_id, channel, ws, match_id, queue_max=self._send_queue_max,
			close_timeout_s=self._close_timeout_s, on_lost=self.disconnect)
		self._sockets.setdefault((user_id, channel), set()).add(connection)
		if channel == "app" and not was_online:
			await self._announce(user_id, True)
		elif channel == "app" and (timer := self._offline_timers.pop(user_id, None)):
			timer.cancel() # voltou dentro do atraso: para os amigos, nunca saiu
		return connection

	async def disconnect(self, connection: Connection, code: int = NORMAL_CLOSURE,
			message: str = "") -> None:
		"""Tira do registro e fecha o socket. Chamar duas vezes não é erro."""
		key = (connection.user_id, connection.channel)
		sockets = self._sockets.get(key)
		registered = sockets is not None and connection in sockets
		if registered:
			sockets.discard(connection)
			if not sockets:
				del self._sockets[key]
		await connection.close(code, message)
		if registered and connection.channel == "app" and not self._has_app_socket(connection.user_id):
			self._offline_timers[connection.user_id] = asyncio.create_task(
				self._go_offline_later(connection.user_id))

	async def close_all(self, code: int) -> None:
		"""Desligamento do backend: fecha tudo, sem anunciar offline para ninguém."""
		for timer in self._offline_timers.values():
			timer.cancel()
		self._offline_timers.clear()
		connections = [c for sockets in self._sockets.values() for c in sockets]
		self._sockets.clear()
		await asyncio.gather(*(c.close(code, "server shutting down") for c in connections))
		for task in self._background:
			task.cancel()

	async def close_match(self, match_id: int, code: int, message: str = "") -> None:
		"""Fecha os sockets game de uma partida só, como a Room que a Simulation derrubou."""
		connections = [c for (_, channel), sockets in self._sockets.items() if channel == "game"
			for c in sockets if c.match_id == match_id]
		await asyncio.gather(*(self.disconnect(c, code, message) for c in connections))

	def in_game(self, user_id: int, match_id: int) -> bool:
		"""Se o User tem um socket game aberto nesta partida (o que substituiu outro, por exemplo)."""
		return any(c.match_id == match_id for c in self._sockets.get((user_id, "game"), ()))

	# ---------- envio ----------

	async def send_to_user(self, user_id: int, message: Message, channel: Channel | None = None,
			*, droppable: bool = False) -> bool:
		"""Enfileira para todas as abas do User no canal (None = os dois). False se ele não tem nenhuma."""
		return self._deliver(self._connections(user_id, channel), to_text(message), droppable)

	async def broadcast(self, user_ids: Iterable[int], message: Message,
			channel: Channel | None = None, *, droppable: bool = False) -> None:
		text = to_text(message) # serializado uma vez, para todos
		self._deliver((c for uid in user_ids for c in self._connections(uid, channel)), text, droppable)

	async def broadcast_all(self, message: Message, channel: Channel = "app") -> None:
		connections = [c for (_, ch), sockets in self._sockets.items() if ch == channel for c in sockets]
		self._deliver(connections, to_text(message), droppable=False)

	def _deliver(self, connections: Iterable[Connection], text: str, droppable: bool) -> bool:
		delivered = False
		for connection in connections:
			delivered = True
			if not connection.push(text, droppable):
				self._spawn(self.disconnect(connection, CloseCode.SLOW_CONSUMER, "send queue is full"))
		return delivered

	# ---------- presença (§2.3) ----------

	def is_online(self, user_id: int) -> bool:
		# continua online durante o atraso do offline: é o que os amigos estão vendo
		return self._has_app_socket(user_id) or user_id in self._offline_timers

	def online_users(self) -> set[int]:
		return {uid for uid, channel in self._sockets if channel == "app"} | self._offline_timers.keys()

	def on_presence_change(self, callback: PresenceCallback) -> None:
		"""Registra mais um callback (user_id, online); todos rodam, na ordem de registro."""
		self._presence_callbacks.append(callback)

	async def _go_offline_later(self, user_id: int) -> None:
		await asyncio.sleep(self._offline_delay_s)
		del self._offline_timers[user_id]
		await self._announce(user_id, False)

	async def _announce(self, user_id: int, online: bool) -> None:
		for callback in tuple(self._presence_callbacks):
			try:
				await callback(user_id, online)
			except Exception: # um callback com defeito não cala os outros
				log.exception("presence callback failed", extra={"user_id": user_id, "online": online})

	# ---------- auxiliares ----------

	def _connections(self, user_id: int, channel: Channel | None) -> list[Connection]:
		# cópia: fechar uma conexão mexe no conjunto enquanto alguém percorre
		channels = CHANNELS if channel is None else (channel,)
		return [c for ch in channels for c in self._sockets.get((user_id, ch), ())]

	def _has_app_socket(self, user_id: int) -> bool:
		return (user_id, "app") in self._sockets

	def _spawn(self, coroutine: Awaitable[None]) -> None:
		# guarda a referência: o asyncio só segura a task enquanto alguém a referencia
		task = asyncio.ensure_future(coroutine)
		self._background.add(task)
		task.add_done_callback(self._background.discard)


def get_connection_manager(connection: HTTPConnection) -> ConnectionManager:
	"""Dependência do FastAPI; o teste troca a instância por dependency_overrides."""
	return connection.app.state.connection_manager
