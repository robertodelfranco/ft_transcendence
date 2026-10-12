# backend/tests/ws/test_manager.py
# ConnectionManager contra ws-manager.md §2.2, §2.3, §2.6, §2.7 e §2.8, com o fake_ws no lugar do socket.
import asyncio
from collections.abc import Callable

import pytest
from fastapi import Depends
from httpx import ASGITransport, AsyncClient

from app.game.protocol import CloseCode
from app.ws.manager import ConnectionManager, get_connection_manager


pytestmark = pytest.mark.anyio

OFFLINE_DELAY_S = 0.05


@pytest.fixture
async def manager():
	manager = ConnectionManager(offline_delay_s=OFFLINE_DELAY_S, send_queue_max=3, close_timeout_s=0.05)
	yield manager
	await manager.close_all(1000) # nenhuma task de escrita sobra para o próximo teste


@pytest.fixture
def presence(manager):
	# grava cada anúncio de presença, na ordem
	calls: list[tuple[int, bool]] = []

	async def record(user_id: int, online: bool) -> None:
		calls.append((user_id, online))

	manager.on_presence_change(record)
	return calls


async def until(condition: Callable[[], bool], timeout: float = 1.0) -> None:
	# deixa as tasks de escrita rodarem até a condição valer
	async with asyncio.timeout(timeout):
		while not condition():
			await asyncio.sleep(0)


async def settle() -> None:
	# dá a vez a todas as tasks prontas, sem esperar tempo
	for _ in range(10):
		await asyncio.sleep(0)


# ---------- envio ----------

async def test_send_reaches_every_tab_of_the_user(manager, fake_ws):
	tab1, tab2, other = fake_ws(), fake_ws(), fake_ws()
	await manager.connect(7, "app", tab1)
	await manager.connect(7, "app", tab2)
	await manager.connect(9, "app", other)

	assert await manager.send_to_user(7, {"v": 1, "type": "presence", "user_id": 21, "online": True})
	await until(lambda: tab1.sent and tab2.sent)
	assert tab1.sent == tab2.sent == ['{"v":1,"type":"presence","user_id":21,"online":true}']
	assert other.sent == []


async def test_send_to_offline_user_returns_false(manager):
	assert await manager.send_to_user(7, "x") is False


async def test_channel_filter(manager, fake_ws):
	app_ws, game_ws = fake_ws(), fake_ws()
	await manager.connect(7, "app", app_ws)
	await manager.connect(7, "game", game_ws, match_id=12)

	await manager.send_to_user(7, "only-game", channel="game")
	await manager.send_to_user(7, "both")
	await until(lambda: len(game_ws.sent) == 2 and app_ws.sent)
	assert app_ws.sent == ["both"]
	assert game_ws.sent == ["only-game", "both"]


async def test_order_is_preserved(manager, fake_ws):
	ws = fake_ws()
	await manager.connect(7, "app", ws)
	for number in range(3):
		await manager.send_to_user(7, str(number))
	await until(lambda: len(ws.sent) == 3)
	assert ws.sent == ["0", "1", "2"]


async def test_broadcast_and_broadcast_all(manager, fake_ws):
	a, b, c, game = fake_ws(), fake_ws(), fake_ws(), fake_ws()
	await manager.connect(7, "app", a)
	await manager.connect(9, "app", b)
	await manager.connect(21, "app", c)
	await manager.connect(7, "game", game, match_id=12)

	await manager.broadcast([7, 9], "friends")
	await manager.broadcast_all("lobby")
	await until(lambda: len(a.sent) == 2 and len(b.sent) == 2 and c.sent and game.sent)
	assert a.sent == b.sent == ["friends", "lobby"]
	assert c.sent == ["lobby"] # broadcast_all fica no canal app
	assert game.sent == ["friends"]


async def test_send_never_raises_and_a_dead_socket_leaves(manager, fake_ws):
	ws = fake_ws()
	await manager.connect(7, "app", ws)
	ws.broken = True

	assert await manager.send_to_user(7, "lost") # enfileirou; quem descobre a queda é o writer
	await until(lambda: ws.close_code is not None)
	assert await manager.send_to_user(7, "after") is False


async def test_a_new_snapshot_replaces_the_one_still_waiting(manager, fake_ws):
	ws = fake_ws()
	await manager.connect(9, "game", ws, match_id=12)
	ws.flowing.clear() # cliente lento: nada sai

	await manager.send_to_user(9, "event-1") # o writer pega este e trava no envio
	await settle()
	await manager.send_to_user(9, "snapshot-1", droppable=True)
	await manager.send_to_user(9, "event-2")
	await manager.send_to_user(9, "snapshot-2", droppable=True) # toma o lugar do snapshot-1

	ws.flowing.set()
	await until(lambda: len(ws.sent) == 3)
	assert ws.sent == ["event-1", "snapshot-2", "event-2"]


async def test_snapshots_alone_never_overflow_the_queue(manager, fake_ws):
	ws = fake_ws()
	await manager.connect(9, "game", ws, match_id=12)
	ws.flowing.clear()
	for tick in range(100):
		await manager.send_to_user(9, f"snapshot-{tick}", droppable=True)
	ws.flowing.set()
	await until(lambda: ws.sent and ws.sent[-1] == "snapshot-99")
	assert ws.close_code is None
	assert len(ws.sent) <= 2 # o que já estava saindo e o último


async def test_slow_consumer_is_closed_with_4429(manager, fake_ws):
	ws = fake_ws()
	await manager.connect(9, "game", ws, match_id=12)
	ws.flowing.clear()
	await manager.send_to_user(9, "in-flight")
	await settle()
	for number in range(3): # send_queue_max = 3
		await manager.send_to_user(9, f"event-{number}")
	assert ws.close_code is None

	await manager.send_to_user(9, "one-too-many")
	await until(lambda: ws.close_code is not None)
	assert ws.close_code == CloseCode.SLOW_CONSUMER
	assert await manager.send_to_user(9, "after") is False


# ---------- canal game (§2.6) ----------

async def test_new_game_socket_replaces_the_old_one_with_4408(manager, fake_ws):
	old, new = fake_ws(), fake_ws()
	await manager.connect(7, "game", old, match_id=12)
	await manager.connect(7, "game", new, match_id=12)

	assert old.close_code == CloseCode.REPLACED
	assert old.messages[-1] == {"v": 1, "type": "error", "code": "replaced",
		"message": "replaced by a newer connection"}
	await manager.send_to_user(7, "tick", channel="game")
	await until(lambda: new.sent)
	assert new.sent == ["tick"]


async def test_app_channel_keeps_every_tab(manager, fake_ws):
	tab1, tab2 = fake_ws(), fake_ws()
	await manager.connect(7, "app", tab1)
	await manager.connect(7, "app", tab2)
	assert tab1.close_code is None and tab2.close_code is None


# ---------- fechamento (§2.8) ----------

async def test_disconnect_sends_the_error_then_closes(manager, fake_ws):
	ws = fake_ws()
	connection = await manager.connect(7, "game", ws, match_id=12)
	await manager.disconnect(connection, CloseCode.ROOM_NOT_FOUND, "match 12 has no room")

	assert ws.close_code == CloseCode.ROOM_NOT_FOUND
	assert ws.messages == [{"v": 1, "type": "error", "code": "room_not_found",
		"message": "match 12 has no room"}]


async def test_normal_close_sends_no_error(manager, fake_ws):
	ws = fake_ws()
	connection = await manager.connect(7, "app", ws)
	await manager.disconnect(connection)
	assert (ws.close_code, ws.sent) == (1000, [])


async def test_disconnect_twice_is_harmless(manager, fake_ws):
	ws = fake_ws()
	connection = await manager.connect(7, "app", ws)
	await manager.disconnect(connection, CloseCode.INVALID_MESSAGE, "bad")
	await manager.disconnect(connection, CloseCode.INVALID_MESSAGE, "bad")
	assert len(ws.sent) == 1


async def test_closing_a_stuck_socket_does_not_hang(manager, fake_ws):
	ws = fake_ws()
	connection = await manager.connect(7, "app", ws)
	ws.flowing.clear() # nem o error consegue sair
	async with asyncio.timeout(1):
		await manager.disconnect(connection, CloseCode.SLOW_CONSUMER, "stuck")
	assert ws.close_code == CloseCode.SLOW_CONSUMER


async def test_close_all_closes_everything_with_4503_and_announces_nothing(manager, presence, fake_ws):
	sockets = [fake_ws() for _ in range(3)]
	await manager.connect(7, "app", sockets[0])
	await manager.connect(9, "app", sockets[1])
	await manager.connect(9, "game", sockets[2], match_id=12)
	presence.clear()

	await manager.close_all(CloseCode.SERVER_SHUTDOWN)
	await asyncio.sleep(OFFLINE_DELAY_S * 2)
	assert {ws.close_code for ws in sockets} == {CloseCode.SERVER_SHUTDOWN}
	assert manager.online_users() == set()
	assert presence == []


# ---------- presença (§2.3) ----------

async def test_first_tab_announces_online_and_the_second_does_not(manager, presence, fake_ws):
	await manager.connect(7, "app", fake_ws())
	await manager.connect(7, "app", fake_ws())
	assert presence == [(7, True)]
	assert manager.is_online(7)
	assert manager.online_users() == {7}


async def test_game_socket_does_not_count_as_online(manager, presence, fake_ws):
	await manager.connect(7, "game", fake_ws(), match_id=12)
	assert presence == []
	assert not manager.is_online(7)


async def test_closing_one_of_two_tabs_changes_nothing(manager, presence, fake_ws):
	tab1 = await manager.connect(7, "app", fake_ws())
	await manager.connect(7, "app", fake_ws())
	await manager.disconnect(tab1)
	await asyncio.sleep(OFFLINE_DELAY_S * 2)
	assert presence == [(7, True)]


async def test_offline_is_announced_only_after_the_delay(manager, presence, fake_ws):
	tab = await manager.connect(7, "app", fake_ws())
	await manager.disconnect(tab)
	assert presence == [(7, True)]
	assert manager.is_online(7) # os amigos ainda o veem online durante o atraso

	await until(lambda: len(presence) == 2)
	assert presence == [(7, True), (7, False)]
	assert not manager.is_online(7)


async def test_reloading_the_page_does_not_flicker(manager, presence, fake_ws):
	tab = await manager.connect(7, "app", fake_ws())
	await manager.disconnect(tab)
	await manager.connect(7, "app", fake_ws()) # voltou dentro do atraso
	await asyncio.sleep(OFFLINE_DELAY_S * 2)
	assert presence == [(7, True)]
	assert manager.is_online(7)


async def test_every_callback_runs_even_if_one_fails(manager, fake_ws):
	calls: list[str] = []

	async def broken(user_id: int, online: bool) -> None:
		raise RuntimeError("boom")

	async def lobby(user_id: int, online: bool) -> None:
		calls.append("lobby")

	manager.on_presence_change(broken)
	manager.on_presence_change(lobby)
	await manager.connect(7, "app", fake_ws())
	assert calls == ["lobby"]


# ---------- integração com o app ----------

async def test_dependency_returns_the_app_manager_and_can_be_overridden(app):
	other = ConnectionManager()
	seen: list[ConnectionManager] = []

	@app.get("/api/test/manager")
	async def route(manager: ConnectionManager = Depends(get_connection_manager)) -> dict:
		seen.append(manager)
		return {}

	async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
		await client.get("/api/test/manager")
		app.dependency_overrides[get_connection_manager] = lambda: other
		await client.get("/api/test/manager")
	assert seen == [app.state.connection_manager, other]


async def test_shutdown_closes_every_socket_with_4503(app, fake_ws):
	ws = fake_ws()
	async with app.router.lifespan_context(app):
		await app.state.connection_manager.connect(7, "app", ws)
	assert ws.close_code == CloseCode.SERVER_SHUTDOWN
