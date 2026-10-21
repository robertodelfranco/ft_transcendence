"""O que `/ws/game` e `/ws/app` fazem igual: ler um frame, recusar com `error` + código, autenticar.

Os dois sockets seguem o mesmo roteiro (ws-manager.md §2.8): o token chega no `join`, em até 5 s,
e toda recusa manda `error` com o code antes de fechar.
"""
import contextlib
from collections.abc import Awaitable, Callable
from functools import partial
from typing import Any, Protocol

from fastapi import WebSocket, WebSocketDisconnect

from app.auth.models import User
from app.auth.service import authenticate_ws_token
from app.game.protocol import CloseCode, encode_error


JOIN_TIMEOUT_S = 5.0 # ws-messages.md §2.8 e ws-manager.md §2.4
Authenticate = Callable[[str], Awaitable[User]]


class ServerSocket(Protocol):
	"""O que os endpoints usam do WebSocket do Starlette; o `fake_ws` dos testes cumpre o mesmo."""

	async def receive(self) -> dict[str, Any]: ...
	async def send_text(self, data: str) -> None: ...
	async def close(self, code: int = 1000, reason: str | None = None) -> None: ...


class Refused(Exception):
	"""O socket fecha com `close`, depois de um `error` com o mesmo code."""

	def __init__(self, close: CloseCode, message: str) -> None:
		super().__init__(message)
		self.close = close


def get_authenticate(ws: WebSocket) -> Authenticate:
	"""Dependência do FastAPI; o teste troca por dependency_overrides, sem banco."""
	return partial(authenticate_ws_token, ws)


async def receive(ws: ServerSocket) -> str | bytes:
	# receive() e não receive_text(): um frame binário vira 4400, não um KeyError
	message = await ws.receive()
	if message["type"] == "websocket.disconnect":
		raise WebSocketDisconnect(message.get("code", 1000))
	text = message.get("text")
	return text if text is not None else message.get("bytes") or b""


async def refuse(ws: ServerSocket, refusal: Refused) -> None:
	# antes do connect o socket não tem Connection: o error e o close saem daqui mesmo
	with contextlib.suppress(Exception): # o cliente pode já ter ido embora
		await ws.send_text(encode_error(refusal.close, str(refusal)))
	with contextlib.suppress(Exception):
		await ws.close(refusal.close)
