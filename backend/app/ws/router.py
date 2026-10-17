"""O socket da casca, `/ws/app` (ws-manager.md §2.3, §2.4 e §2.8).

A casca o abre logo depois do login e o mantém aberto enquanto o site estiver aberto. Depois do
`join` ele é só de ida: o servidor manda presença e lobby, e o cliente só pode mandar `ping`.
Toda ação da casca é HTTP (decisão 6).
"""
import asyncio
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect

from app.auth.security import InvalidToken
from app.game.protocol import CloseCode, InvalidMessage, encode_pong
from app.ws.app_events import FriendGraph, get_friend_graph, online_friends
from app.ws.handshake import (JOIN_TIMEOUT_S, Authenticate, Refused, ServerSocket, get_authenticate,
	receive, refuse)
from app.ws.manager import Connection, ConnectionManager, get_connection_manager
from app.ws.messages import AppJoin, AppPing, encode_welcome, parse_app_message


log = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/ws/app")
async def app_socket(ws: WebSocket,
		connections: Annotated[ConnectionManager, Depends(get_connection_manager)],
		authenticate: Annotated[Authenticate, Depends(get_authenticate)],
		friends: Annotated[FriendGraph, Depends(get_friend_graph)]) -> None:
	await ws.accept()
	await serve(ws, connections=connections, authenticate=authenticate, friends=friends)


async def serve(ws: ServerSocket, *, connections: ConnectionManager, authenticate: Authenticate,
		friends: FriendGraph, join_timeout_s: float = JOIN_TIMEOUT_S) -> None:
	try:
		user_id = await _join(ws, authenticate, join_timeout_s)
	except Refused as refusal:
		log.info("app socket refused", extra={"code": refusal.close.code})
		await refuse(ws, refusal)
		return
	except WebSocketDisconnect: # o cliente desistiu antes do join
		return

	connection = await connections.connect(user_id, "app", ws)
	try:
		# os amigos online são lidos depois do connect, não antes: uma presença que muda no meio já
		# chega a este socket, e o welcome, montado por último, é o estado mais novo dos dois.
		# Por isso uma presence ou um lobby_update podem chegar antes do welcome (ws-manager.md §2.4)
		_send(connection, encode_welcome(user_id, await online_friends(connections, friends, user_id)))
		await _read(ws, connection)
	except Refused as refusal:
		await connections.disconnect(connection, refusal.close, str(refusal))
	except WebSocketDisconnect:
		pass
	except Exception:
		# o banco falhou ao montar o welcome: o 4503 faz a casca reconectar com espera crescente,
		# e o 1000 do finally a faria desistir de vez (ws-manager.md §2.9)
		log.exception("app socket failed", extra={"user_id": user_id})
		await connections.disconnect(connection, CloseCode.SERVER_SHUTDOWN, "internal error")
	finally:
		await connections.disconnect(connection) # não é erro se já saiu; o offline espera 5 s


async def _join(ws: ServerSocket, authenticate: Authenticate, timeout_s: float) -> int:
	try:
		# o prazo cobre a autenticação também: é o join válido que tem 5 s
		async with asyncio.timeout(timeout_s):
			message = parse_app_message(await receive(ws))
			if not isinstance(message, AppJoin):
				raise Refused(CloseCode.UNAUTHENTICATED, f"expected join, got {message.type}")
			user = await authenticate(message.token)
	except TimeoutError:
		raise Refused(CloseCode.UNAUTHENTICATED, f"no join within {timeout_s:g} s") from None
	except InvalidMessage as error:
		raise Refused(CloseCode.INVALID_MESSAGE, str(error)) from None
	except InvalidToken:
		raise Refused(CloseCode.UNAUTHENTICATED, "invalid or expired token") from None
	return user.id


async def _read(ws: ServerSocket, connection: Connection) -> None:
	while True:
		try:
			message = parse_app_message(await receive(ws))
		except InvalidMessage as error:
			raise Refused(CloseCode.INVALID_MESSAGE, str(error)) from None
		if isinstance(message, AppPing):
			_send(connection, encode_pong(message.t))
		else: # o único outro tipo é um segundo join
			raise Refused(CloseCode.INVALID_MESSAGE, "join was already accepted")


def _send(connection: Connection, text: str) -> None:
	# para este socket só, e não para todas as abas do User como o send_to_user faria
	if not connection.push(text, droppable=False):
		raise Refused(CloseCode.SLOW_CONSUMER, "send queue is full")
