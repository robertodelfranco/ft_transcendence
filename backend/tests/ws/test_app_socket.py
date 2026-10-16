# backend/tests/ws/test_app_socket.py
# /ws/app contra ws-manager.md §2.3, §2.4 e §2.8: o serve com o fake_ws e a amizade num dicionário,
# e a rota de verdade com o TestClient.
import asyncio
from collections.abc import Callable

import pytest
from starlette.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.auth.models import User
from app.auth.security import InvalidToken
from app.game.protocol import CloseCode
from app.ws.app_events import notify_presence
from app.ws.handshake import get_authenticate
from app.ws.manager import ConnectionManager
from app.ws.router import serve


OFFLINE_DELAY_S = 0.05


async def authenticate(token: str) -> User:
	# "t7" é o token do User 7; qualquer outro é inválido
	if not token.startswith("t"):
		raise InvalidToken("bad token")
	return User(id=int(token[1:]), username=f"user{token[1:]}")


def join(user_id: int) -> dict:
	return {"v": 1, "type": "join", "token": f"t{user_id}"}


async def until(condition: Callable[[], bool], timeout: float = 1.0) -> None:
	async with asyncio.timeout(timeout):
		while not condition():
			await asyncio.sleep(0.005)


def presence(user_id: int, online: bool) -> dict:
	return {"v": 1, "type": "presence", "user_id": user_id, "online": online}


# ---------- serve, com o fake_ws ----------

@pytest.fixture
async def connections():
	connections = ConnectionManager(offline_delay_s=OFFLINE_DELAY_S, close_timeout_s=0.05)
	yield connections
	await connections.close_all(1000)


@pytest.fixture
def graph(connections, fake_friends):
	# 1 adicionou 2 e 3; 2 adicionou 1
	graph = fake_friends({1: {2, 3}, 2: {1}})
	connections.on_presence_change(lambda user_id, online:
		notify_presence(connections, graph, user_id, online))
	return graph


@pytest.fixture
def open_socket(connections, graph, fake_ws):
	"""Abre um socket no serve e devolve o fake; as tasks são esperadas no fim do teste."""
	tasks: list[asyncio.Task] = []

	def open_(join_timeout_s: float = 5.0):
		ws = fake_ws()
		tasks.append(asyncio.create_task(serve(ws, connections=connections, authenticate=authenticate,
			friends=graph, join_timeout_s=join_timeout_s)))
		ws.task = tasks[-1]
		return ws
	yield open_
	for task in tasks:
		task.cancel()


async def joined(open_socket, user_id: int):
	ws = open_socket()
	ws.client_send(join(user_id))
	await until(lambda: any(m["type"] == "welcome" for m in ws.messages))
	return ws


@pytest.mark.anyio
async def test_join_gets_a_welcome_with_the_friends_online(open_socket, connections):
	await joined(open_socket, 3) # amigo de 1, online
	ws = await joined(open_socket, 1)
	welcome = next(m for m in ws.messages if m["type"] == "welcome")
	assert welcome == {"v": 1, "type": "welcome", "user_id": 1, "online_friends": [3]}
	assert connections.is_online(1)


@pytest.mark.anyio
async def test_ping_gets_a_pong_on_this_tab_only(open_socket):
	tab_a = await joined(open_socket, 1)
	tab_b = await joined(open_socket, 1)
	tab_a.client_send({"v": 1, "type": "ping", "t": 123.5})
	await until(lambda: any(m["type"] == "pong" for m in tab_a.messages))
	await asyncio.sleep(0.02)
	assert {"v": 1, "type": "pong", "t": 123.5} in tab_a.messages
	assert all(m["type"] != "pong" for m in tab_b.messages)


@pytest.mark.anyio
@pytest.mark.parametrize("first, close", [
	("{not json", CloseCode.INVALID_MESSAGE),
	(b"\x00\x01", CloseCode.INVALID_MESSAGE), # frame binário
	({"v": 1, "type": "join", "token": "t7", "match_id": 12}, CloseCode.INVALID_MESSAGE),
	({"v": 1, "type": "ping", "t": 1}, CloseCode.UNAUTHENTICATED), # nada antes do join
	({"v": 1, "type": "join", "token": "forged"}, CloseCode.UNAUTHENTICATED),
])
async def test_join_refusals(open_socket, connections, first, close):
	ws = open_socket()
	ws.client_send(first)
	await ws.task
	assert ws.messages[-1]["type"] == "error"
	assert ws.messages[-1]["code"] == close.code
	assert ws.close_code == close
	assert connections.online_users() == set()


@pytest.mark.anyio
async def test_no_join_in_time_closes_with_4401(open_socket):
	ws = open_socket(join_timeout_s=0.05)
	await ws.task
	assert ws.messages == [ws.messages[0]]
	assert ws.messages[0]["code"] == "unauthenticated"
	assert ws.close_code == CloseCode.UNAUTHENTICATED


@pytest.mark.anyio
@pytest.mark.parametrize("extra", [
	join(1), # segundo join
	{"v": 1, "type": "input", "seq": 1}, # o /ws/app é só de ida
	"{broken",
])
async def test_anything_but_ping_after_join_closes_with_4400(open_socket, extra):
	ws = await joined(open_socket, 1)
	ws.client_send(extra)
	await ws.task
	assert ws.messages[-1]["code"] == "invalid_message"
	assert ws.close_code == CloseCode.INVALID_MESSAGE


@pytest.mark.anyio
async def test_a_database_failure_closes_with_4503_so_the_client_retries(connections, fake_ws,
		fake_friends):
	class BrokenGraph(fake_friends):
		async def friends_of(self, user_id: int) -> list[int]:
			raise ConnectionError("database is down")

	ws = fake_ws()
	ws.client_send(join(1))
	await serve(ws, connections=connections, authenticate=authenticate, friends=BrokenGraph())
	assert ws.messages[-1]["code"] == "server_shutdown"
	assert ws.close_code == CloseCode.SERVER_SHUTDOWN # 1000 faria a casca desistir


@pytest.mark.anyio
async def test_client_leaving_before_join_is_quiet(open_socket, connections):
	ws = open_socket()
	ws.client_close()
	await ws.task
	assert ws.sent == []


# ---------- aceite da issue: duas abas do mesmo User ----------

@pytest.mark.anyio
async def test_two_tabs_presence(open_socket, connections, graph):
	watcher = await joined(open_socket, 1) # 1 tem o 2 como amigo
	tab_a = await joined(open_socket, 2)
	tab_b = await joined(open_socket, 2)
	await until(lambda: presence(2, True) in watcher.messages)

	tab_a.client_close()
	await tab_a.task
	await asyncio.sleep(OFFLINE_DELAY_S * 3)
	assert presence(2, False) not in watcher.messages # fechar uma de duas abas não muda nada
	assert connections.is_online(2)

	tab_b.client_close()
	await tab_b.task
	assert presence(2, False) not in watcher.messages # ainda dentro do atraso
	await until(lambda: presence(2, False) in watcher.messages)
	assert graph.seen == [2]


@pytest.mark.anyio
async def test_reloading_within_the_delay_is_invisible_to_friends(open_socket, graph):
	watcher = await joined(open_socket, 1)
	tab = await joined(open_socket, 2)
	tab.client_close()
	await tab.task
	await joined(open_socket, 2) # recarregou a página
	await asyncio.sleep(OFFLINE_DELAY_S * 3)
	assert watcher.messages.count(presence(2, True)) == 1
	assert presence(2, False) not in watcher.messages
	assert graph.seen == []


# ---------- a rota de verdade, com o TestClient ----------

@pytest.fixture
def route(app, fake_friends):
	app.dependency_overrides[get_authenticate] = lambda: authenticate
	app.state.friend_graph = fake_friends({7: {9}}) # o callback de presença também lê daqui
	with TestClient(app) as client:
		yield client


def test_the_route_answers_join_and_ping(route):
	with route.websocket_connect("/ws/app") as ws:
		ws.send_json(join(7))
		assert ws.receive_json() == {"v": 1, "type": "welcome", "user_id": 7, "online_friends": []}
		ws.send_json({"v": 1, "type": "ping", "t": 5})
		assert ws.receive_json() == {"v": 1, "type": "pong", "t": 5}


@pytest.mark.parametrize("message, close", [
	({"v": 1, "type": "join", "token": "forged"}, CloseCode.UNAUTHENTICATED),
	({"v": 1, "type": "join"}, CloseCode.INVALID_MESSAGE),
])
def test_the_route_refuses_with_error_and_close_code(route, message, close):
	with route.websocket_connect("/ws/app") as ws:
		ws.send_json(message)
		assert ws.receive_json()["code"] == close.code
		with pytest.raises(WebSocketDisconnect) as closed:
			ws.receive_text()
	assert closed.value.code == close
