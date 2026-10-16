"""O socket da partida, `/ws/game/{match_id}` (ws-messages.md §2.2, §2.3, §2.7 e §2.9).

Cada socket passa por três fases: o `join` (autentica e acha a Room, em até 5 s), o `welcome` e o
laço de leitura. O laço só valida e enfileira: quem aplica Input e Action é o tick (rooms.py).
"""
import asyncio
import logging
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
__all__ = ["JOIN_TIMEOUT_S", "get_authenticate", "router", "serve"]

router = APIRouter()


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
		await _read(ws, room, user_id, connections)
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


async def _read(ws: ServerSocket, room: Room, user_id: int, connections: ConnectionManager) -> None:
	while True:
		try:
			message = parse_client_message(await receive(ws))
		except InvalidMessage as error:
			raise Refused(CloseCode.INVALID_MESSAGE, str(error)) from None
		match message:
			case InputMessage() | ActionMessage():
				enqueue(room, user_id, message.to_simulation())
			case Ping(t=t):
				await connections.send_to_user(user_id, encode_pong(t), "game")
			case Join():
				raise Refused(CloseCode.INVALID_MESSAGE, "join was already accepted")
