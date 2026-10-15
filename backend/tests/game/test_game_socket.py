# backend/tests/game/test_game_socket.py
# /ws/game/{match_id} contra ws-messages.md §2.2, §2.3, §2.7 e §2.9: o serve com o fake_ws, no mesmo
# event loop do tick, e a rota de verdade com o TestClient só para as recusas.
import asyncio
from collections.abc import Callable

import pytest
from starlette.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.auth.models import User
from app.auth.security import InvalidToken
from app.game import Mode, RoomOptions
from app.game.protocol import CloseCode
from app.game.rooms import RoomManager
from app.game.router import JOIN_TIMEOUT_S, get_authenticate, serve
from app.game.world import parse_map
from app.ws.manager import ConnectionManager


MATCH = 12
GRID = "1111111\n1NNNNN1\n1111111\n" # coop sem Enemy: o que se testa aqui é o socket
KEYS = {"up": True, "down": False, "left": False, "right": False, "rot_left": False,
	"rot_right": False, "sprint": False}


async def authenticate(token: str) -> User:
	# "t7" é o token do User 7; qualquer outro é inválido
	if not token.startswith("t"):
		raise InvalidToken("bad token")
	return User(id=int(token[1:]), username=f"user{token[1:]}")


def join(user_id: int, match_id: int = MATCH) -> dict:
	return {"v": 1, "type": "join", "match_id": match_id, "token": f"t{user_id}"}


async def until(condition: Callable[[], bool], timeout: float = 1.0) -> None:
	async with asyncio.timeout(timeout):
		while not condition():
			await asyncio.sleep(0.005)


# ---------- serve, com o fake_ws ----------

@pytest.fixture
async def connections():
	connections = ConnectionManager(close_timeout_s=0.05)
	yield connections
	await connections.close_all(1000)


@pytest.fixture
async def rooms(connections):
	rooms = RoomManager(connections, load=lambda name, mode: parse_map(GRID, name, mode))
	rooms.create(MATCH, Mode.COOP, "arena", 5, RoomOptions(), created_by=7)
	for user_id in (7, 9):
		rooms.join(MATCH, user_id, f"user{user_id}", "/media/avatars/default.png")
	rooms.start(MATCH)
	yield rooms
	await rooms.close()


@pytest.fixture
def open_socket(rooms, connections, fake_ws):
	"""Abre um socket no serve e devolve o fake; as tasks são esperadas no fim do teste."""
	tasks: list[asyncio.Task] = []

	def open_(match_id: int = MATCH, join_timeout_s: float = JOIN_TIMEOUT_S):
		ws = fake_ws()
		tasks.append(asyncio.create_task(serve(ws, match_id, rooms=rooms, connections=connections,
			authenticate=authenticate, join_timeout_s=join_timeout_s)))
		ws.task = tasks[-1]
		return ws
	yield open_
	for task in tasks:
		task.cancel()


def player(rooms: RoomManager, user_id: int):
	return rooms.game_room(MATCH).players[user_id]


@pytest.mark.anyio
async def test_join_gets_the_welcome_first_and_then_snapshots(open_socket, rooms, connections):
	ws = open_socket()
	ws.client_send(join(7))
	await until(lambda: sum(m["type"] == "snapshot" for m in ws.messages) >= 2)

	welcome = ws.messages[0]
	assert welcome["type"] == "welcome"
	assert welcome["user_id"] == 7
	assert welcome["room"] == {"match_id": MATCH, "mode": "coop", "map": "arena",
		"options": welcome["room"]["options"]}
	assert welcome["map"]["grid"] == ["1111111", "1000001", "1111111"] # Spawns já viram 0
	assert welcome["snapshot"]["last_input_seq"] == 0
	assert player(rooms, 7).connected
	assert connections.in_game(7, MATCH)


@pytest.mark.anyio
@pytest.mark.parametrize("first, close", [
	("{not json", CloseCode.INVALID_MESSAGE),
	(b"\x00\x01", CloseCode.INVALID_MESSAGE), # frame binário
	(join(7, match_id=13), CloseCode.INVALID_MESSAGE), # outra partida que a do caminho
	({"v": 1, "type": "ping", "t": 1}, CloseCode.UNAUTHENTICATED), # nada antes do join
	({**join(7), "token": "forged"}, CloseCode.UNAUTHENTICATED),
])
async def test_join_refusals(open_socket, connections, first, close):
	ws = open_socket()
	ws.client_send(first)
	await until(lambda: ws.close_code is not None)
	assert ws.close_code == close
	assert ws.messages == [{"v": 1, "type": "error", "code": close.code, "message": ws.messages[0]["message"]}]
	assert not connections.in_game(7, MATCH)


@pytest.mark.anyio
async def test_no_join_in_time_is_4401(open_socket):
	ws = open_socket(join_timeout_s=0.05)
	await until(lambda: ws.close_code is not None)
	assert ws.close_code == CloseCode.UNAUTHENTICATED


@pytest.mark.anyio
async def test_a_room_still_in_the_lobby_or_unknown_is_4404(open_socket, rooms):
	rooms.create(13, Mode.COOP, "arena", 5, RoomOptions(), created_by=15)
	for match_id in (13, 99):
		ws = open_socket(match_id)
		ws.client_send(join(7, match_id))
		await until(lambda: ws.close_code is not None)
		assert ws.close_code == CloseCode.ROOM_NOT_FOUND


@pytest.mark.anyio
async def test_a_finished_match_is_4404(open_socket, rooms):
	rooms.game_room(MATCH).result = {"result": "win", "winner_ids": [7, 9], "reason": "boss_defeated"}
	ws = open_socket()
	ws.client_send(join(7))
	await until(lambda: ws.close_code is not None)
	assert ws.close_code == CloseCode.ROOM_NOT_FOUND


@pytest.mark.anyio
async def test_someone_outside_the_room_is_4403(open_socket):
	ws = open_socket()
	ws.client_send(join(15))
	await until(lambda: ws.close_code is not None)
	assert ws.close_code == CloseCode.NOT_A_MEMBER


@pytest.mark.anyio
async def test_input_goes_to_the_room_and_comes_back_in_last_input_seq(open_socket):
	ws = open_socket()
	ws.client_send(join(7))
	ws.client_send({"v": 1, "type": "input", "seq": 1, "keys": KEYS, "mouse_dx": 0.0})
	ws.client_send({"v": 1, "type": "action", "seq": 2, "kind": "door"})
	await until(lambda: any(m["type"] == "snapshot" and m["last_input_seq"] == 1 for m in ws.messages))


@pytest.mark.anyio
async def test_ping_gets_a_pong_with_the_same_t(open_socket):
	ws = open_socket()
	ws.client_send(join(7))
	ws.client_send({"v": 1, "type": "ping", "t": 1759420800123.5})
	await until(lambda: any(m["type"] == "pong" for m in ws.messages))
	assert next(m for m in ws.messages if m["type"] == "pong")["t"] == 1759420800123.5


@pytest.mark.anyio
@pytest.mark.parametrize("bad", [join(7), {"v": 1, "type": "input", "seq": 1}])
async def test_a_bad_message_after_the_join_is_4400(open_socket, rooms, connections, bad):
	ws = open_socket()
	ws.client_send(join(7))
	ws.client_send(bad)
	await until(lambda: ws.close_code is not None)
	assert ws.close_code == CloseCode.INVALID_MESSAGE
	assert ws.messages[-1]["code"] == "invalid_message"
	await ws.task
	assert not player(rooms, 7).connected
	assert not connections.in_game(7, MATCH)


@pytest.mark.anyio
async def test_the_client_leaving_marks_the_player_disconnected(open_socket, rooms):
	ws = open_socket()
	ws.client_send(join(7))
	await until(lambda: player(rooms, 7).connected)
	ws.client_close()
	await ws.task
	assert not player(rooms, 7).connected


@pytest.mark.anyio
async def test_a_newer_socket_replaces_the_old_one_and_the_player_stays_connected(open_socket, rooms):
	old = open_socket()
	old.client_send(join(7))
	await until(lambda: player(rooms, 7).connected)
	new = open_socket()
	new.client_send(join(7))
	await old.task # o socket velho terminou de sair
	assert old.close_code == CloseCode.REPLACED
	await until(lambda: any(m["type"] == "welcome" for m in new.messages))
	assert player(rooms, 7).connected


# ---------- a rota de verdade, com o TestClient ----------

@pytest.fixture
def route(app):
	app.dependency_overrides[get_authenticate] = lambda: authenticate
	with TestClient(app) as client:
		yield client


@pytest.mark.parametrize("message, close", [
	(join(7, match_id=13), CloseCode.INVALID_MESSAGE),
	({**join(7), "token": "forged"}, CloseCode.UNAUTHENTICATED),
	(join(7), CloseCode.ROOM_NOT_FOUND), # nenhuma partida rodando neste app
])
def test_the_route_refuses_with_error_and_close_code(route, message, close):
	with route.websocket_connect(f"/ws/game/{MATCH}") as ws:
		ws.send_json(message)
		assert ws.receive_json()["code"] == close.code
		with pytest.raises(WebSocketDisconnect) as closed:
			ws.receive_text()
	assert closed.value.code == close
