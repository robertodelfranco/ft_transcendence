"""O socket da partida, `/ws/game/{match_id}` (ws-messages.md §2.2, §2.3, §2.7 e §2.9).

Cada socket passa por três fases: o `join` (autentica e acha a Room, em até 5 s), o `welcome` e o
laço de leitura. O laço só valida e enfileira: quem aplica Input e Action é o tick (rooms.py).
"""
import asyncio
import logging
import time
from collections.abc import Callable
from typing import Annotated

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect

from app.auth.security import InvalidToken
from app.game import Room, enqueue, initial_grid, last_input_seq, set_connected, to_snapshot
from app.game.protocol import (ActionMessage, CloseCode, InputMessage, InvalidMessage, Join, Ping,
	encode_pong, encode_welcome, parse_client_message)
from app.game.rooms import RoomManager, get_room_manager
from app.ws.handshake import (JOIN_TIMEOUT_S, Authenticate, Refused, ServerSocket, get_authenticate,
	receive, refuse)
from app.ws.manager import ConnectionManager, get_connection_manager


log = logging.getLogger(__name__)

# JOIN_TIMEOUT_S e get_authenticate continuam importáveis daqui: os testes do /ws/game os usam
__all__ = ["JOIN_TIMEOUT_S", "MESSAGE_BURST", "MESSAGES_PER_S", "MessageBudget", "get_authenticate",
	"router", "serve"]

# o cliente honesto manda 30 input/s, algumas action e um ping de vez em quando; 60/s é também o
# máximo que o Tick aplica (2 por Tick, ws-messages.md §2.9)
MESSAGES_PER_S = 60.0
# o TCP entrega de uma vez o que ficou represado numa retransmissão: 2 s de mensagens cabem
MESSAGE_BURST = 120

router = APIRouter()


class MessageBudget:
	"""Token bucket por socket: `rate` mensagens por segundo, com rajada de até `burst`.

	Conta o frame antes do parse, que é o trabalho caro: um cliente que inunda o socket não gasta
	CPU do event loop que também roda o tick de todas as Rooms. O ritmo e a rajada são separados de
	propósito: uma janela fixa de "60 em 1 s" derrubaria o cliente honesto logo depois de um soluço
	da rede, quando as mensagens represadas chegam juntas.
	"""

	__slots__ = ("_rate", "_burst", "_tokens", "_clock", "_last")

	def __init__(self, rate: float = MESSAGES_PER_S, burst: int = MESSAGE_BURST, *,
			clock: Callable[[], float] = time.monotonic) -> None:
		if rate <= 0 or burst < 1:
			raise ValueError("a budget needs rate > 0 and burst >= 1")
		self._rate = rate
		self._burst = float(burst)
		self._tokens = float(burst) # começa cheio: quem acabou de reconectar pode despejar a fila
		self._clock = clock
		self._last = clock()

	def take(self) -> bool:
		"""Gasta uma vaga. False: o socket passou do limite. O(1), sem alocar."""
		now = self._clock()
		# monotonic não volta, mas um relógio injetado poderia: tempo negativo não tira vaga
		elapsed = max(0.0, now - self._last)
		self._last = now
		self._tokens = min(self._burst, self._tokens + elapsed * self._rate)
		if self._tokens < 1.0:
			return False
		self._tokens -= 1.0
		return True


@router.websocket("/ws/game/{match_id}")
async def game_socket(ws: WebSocket, match_id: int,
		rooms: Annotated[RoomManager, Depends(get_room_manager)],
		connections: Annotated[ConnectionManager, Depends(get_connection_manager)],
		authenticate: Annotated[Authenticate, Depends(get_authenticate)]) -> None:
	await ws.accept()
	await serve(ws, match_id, rooms=rooms, connections=connections, authenticate=authenticate)


async def serve(ws: ServerSocket, match_id: int, *, rooms: RoomManager, connections: ConnectionManager,
		authenticate: Authenticate, join_timeout_s: float = JOIN_TIMEOUT_S) -> None:
	try:
		user_id, room = await _join(ws, match_id, rooms, authenticate, join_timeout_s)
	except Refused as refusal:
		log.info("game socket refused", extra={"match_id": match_id, "code": refusal.close.code})
		await refuse(ws, refusal)
		return
	except WebSocketDisconnect: # o cliente desistiu antes do join
		return

	connection = await connections.connect(user_id, "game", ws, match_id=match_id)
	# daqui ao welcome não há await que suspenda: nenhum Snapshot do tick entra na fila antes dele
	set_connected(room, user_id, True)
	await connections.send_to_user(user_id, _welcome(rooms, room, match_id, user_id), "game")
	try:
		await _read(ws, room, user_id, connections, MessageBudget())
	except Refused as refusal:
		await connections.disconnect(connection, refusal.close, str(refusal))
	except WebSocketDisconnect:
		pass
	finally:
		await connections.disconnect(connection) # não é erro se já saiu
		# substituído por um socket novo (4408): quem está conectado agora é o novo
		if not connections.in_game(user_id, match_id):
			set_connected(room, user_id, False)


# ---------- fases ----------

async def _join(ws: ServerSocket, match_id: int, rooms: RoomManager, authenticate: Authenticate,
		timeout_s: float) -> tuple[int, Room]:
	try:
		# o prazo cobre a autenticação também: é o join válido que tem 5 s
		async with asyncio.timeout(timeout_s):
			message = parse_client_message(await receive(ws))
			if not isinstance(message, Join):
				raise Refused(CloseCode.UNAUTHENTICATED, f"expected join, got {message.type}")
			if message.match_id != match_id:
				raise Refused(CloseCode.INVALID_MESSAGE,
					f"join is for match {message.match_id}, socket is for {match_id}")
			user = await authenticate(message.token)
	except TimeoutError:
		raise Refused(CloseCode.UNAUTHENTICATED, f"no join within {timeout_s:g} s") from None
	except InvalidMessage as error:
		raise Refused(CloseCode.INVALID_MESSAGE, str(error)) from None
	except InvalidToken:
		raise Refused(CloseCode.UNAUTHENTICATED, "invalid or expired token") from None

	# só depois do token: quem não se autenticou não descobre que partidas existem
	room = rooms.game_room(match_id) # None também enquanto está no Lobby
	if room is None or room.result is not None:
		raise Refused(CloseCode.ROOM_NOT_FOUND, f"match {match_id} is not running")
	player = room.players.get(user.id)
	if player is None or player.left:
		raise Refused(CloseCode.NOT_A_MEMBER, f"user {user.id} is not in match {match_id}")
	return user.id, room


def _welcome(rooms: RoomManager, room: Room, match_id: int, user_id: int) -> str:
	info = rooms.info(match_id)
	return encode_welcome(user_id=user_id, match_id=match_id, mode=info.mode, map_name=info.map,
		options=info.options, grid=initial_grid(room), snapshot=to_snapshot(room),
		last_input_seq=last_input_seq(room, user_id))


async def _read(ws: ServerSocket, room: Room, user_id: int, connections: ConnectionManager,
		budget: MessageBudget) -> None:
	while True:
		frame = await receive(ws)
		if not budget.take():
			# 4400 e não um código novo: só um cliente com defeito ou malicioso chega aqui, e o
			# cliente não reconecta depois de um 4400
			log.warning("game socket flooded", extra={"match_id": room.match_id, "user_id": user_id})
			raise Refused(CloseCode.INVALID_MESSAGE, "too many messages")
		try:
			message = parse_client_message(frame)
		except InvalidMessage as error:
			raise Refused(CloseCode.INVALID_MESSAGE, str(error)) from None
		match message:
			case InputMessage() | ActionMessage():
				enqueue(room, user_id, message.to_simulation())
			case Ping(t=t):
				await connections.send_to_user(user_id, encode_pong(t), "game")
			case Join():
				raise Refused(CloseCode.INVALID_MESSAGE, "join was already accepted")
