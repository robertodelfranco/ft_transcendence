# backend/tests/ws/test_app_events.py
# Lobby ao vivo e presença contra ws-manager.md §2.3 e §2.5: o manager de verdade com o fake_ws, a
# amizade num dicionário; o DbFriendGraph, à parte, contra o Postgres.
import asyncio
from collections.abc import Callable
from contextlib import asynccontextmanager

import pytest
from sqlalchemy import select

from app.auth.models import Friendship, User
from app.game import Mode, RoomOptions
from app.game.rooms import RoomManager
from app.game.world import parse_map
from app.ws.app_events import (DbFriendGraph, notify_presence, online_friends, publish_lobby_removed,
	publish_lobby_update, publish_match_started)
from app.ws.manager import ConnectionManager


pytestmark = pytest.mark.anyio

OFFLINE_DELAY_S = 0.05
GRID = "1111111\n1NNNNN1\n1111111\n"


async def until(condition: Callable[[], bool], timeout: float = 1.0) -> None:
	async with asyncio.timeout(timeout):
		while not condition():
			await asyncio.sleep(0)


async def settle() -> None:
	for _ in range(10):
		await asyncio.sleep(0)


@pytest.fixture
async def manager():
	manager = ConnectionManager(offline_delay_s=OFFLINE_DELAY_S, close_timeout_s=0.05)
	yield manager
	await manager.close_all(1000)


@pytest.fixture
def graph(manager, fake_friends):
	# 1 adicionou 2; 3 adicionou 2 e 1; ninguém adicionou 3
	graph = fake_friends({1: {2}, 3: {1, 2}})
	manager.on_presence_change(lambda user_id, online:
		notify_presence(manager, graph, user_id, online))
	return graph


def types(ws) -> list[str]:
	return [m["type"] for m in ws.messages]


# ---------- lobby ----------

async def test_lobby_update_reaches_every_app_tab_of_everyone(manager, fake_ws):
	rooms = RoomManager(manager, load=lambda name, mode: parse_map(GRID, name, mode))
	rooms.create(12, Mode.COOP, "arena", 5, RoomOptions(), created_by=7)
	info = rooms.info(12)
	tab_a, tab_b, other, game = fake_ws(), fake_ws(), fake_ws(), fake_ws()
	await manager.connect(7, "app", tab_a)
	await manager.connect(7, "app", tab_b)
	await manager.connect(9, "app", other)
	await manager.connect(9, "game", game, match_id=99)

	await publish_lobby_update(manager, info)
	await until(lambda: all(ws.sent for ws in (tab_a, tab_b, other)))

	for ws in (tab_a, tab_b, other):
		assert ws.messages == [{"v": 1, "type": "lobby_update", "room": info.to_payload()}]
	assert game.sent == [] # o lobby é do /ws/app
	await rooms.close()


async def test_lobby_removed_reaches_everyone(manager, fake_ws):
	ws = fake_ws()
	await manager.connect(9, "app", ws)
	await publish_lobby_removed(manager, 13, "started")
	await until(lambda: ws.sent)
	assert ws.messages == [{"v": 1, "type": "lobby_removed", "match_id": 13, "reason": "started"}]


async def test_match_started_reaches_only_the_players(manager, fake_ws):
	player, outsider = fake_ws(), fake_ws()
	await manager.connect(7, "app", player)
	await manager.connect(9, "app", outsider)
	await publish_match_started(manager, 12, [7, 42]) # 42 está offline: não é erro
	await until(lambda: player.sent)
	await settle()
	assert player.messages == [{"v": 1, "type": "match_started", "match_id": 12}]
	assert outsider.sent == []


async def test_publishing_with_nobody_connected_is_harmless(manager):
	await publish_lobby_removed(manager, 13, "aborted")
	await publish_match_started(manager, 12, [7])


# ---------- presença ----------

async def test_online_is_announced_to_who_has_the_user_as_friend(manager, graph, fake_ws):
	watcher_1, watcher_3, stranger = fake_ws(), fake_ws(), fake_ws()
	await manager.connect(1, "app", watcher_1)
	await manager.connect(3, "app", watcher_3)
	await manager.connect(4, "app", stranger)

	await manager.connect(2, "app", fake_ws())
	await until(lambda: watcher_1.sent and watcher_3.sent)
	await settle()

	presence = {"v": 1, "type": "presence", "user_id": 2, "online": True}
	assert presence in watcher_1.messages
	assert presence in watcher_3.messages
	assert all(m.get("user_id") != 2 for m in stranger.messages) # 4 não adicionou o 2


async def test_friendship_is_one_way(manager, graph, fake_ws):
	# 1 adicionou 2, mas 2 não adicionou 1: 2 não fica sabendo quando 1 entra
	ws_2 = fake_ws()
	await manager.connect(2, "app", ws_2)
	await manager.connect(1, "app", fake_ws())
	await settle()
	assert all(m.get("user_id") != 1 for m in ws_2.messages)


async def test_offline_is_announced_after_the_delay_and_marks_last_seen(manager, graph, fake_ws):
	watcher, friend = fake_ws(), fake_ws()
	await manager.connect(1, "app", watcher)
	connection = await manager.connect(2, "app", friend)
	await manager.disconnect(connection)
	await settle()
	assert {"v": 1, "type": "presence", "user_id": 2, "online": False} not in watcher.messages
	assert graph.seen == []

	offline = {"v": 1, "type": "presence", "user_id": 2, "online": False}
	await until(lambda: offline in watcher.messages and graph.seen == [2])


async def test_a_stale_announcement_is_dropped(manager, fake_ws, fake_friends):
	# o offline chega atrasado (o User já voltou), e o online chega depois que ele já saiu
	graph = fake_friends({1: {2}})
	watcher = fake_ws()
	await manager.connect(1, "app", watcher)
	await manager.connect(2, "app", fake_ws())

	await notify_presence(manager, graph, 2, False) # 2 continua online
	await notify_presence(manager, graph, 3, True) # 3 não está online
	await settle()
	assert all(m["type"] != "presence" or m["user_id"] == 2 and m["online"] for m in watcher.messages)
	assert graph.seen == []


async def test_online_friends_lists_only_friends_online_now(manager, fake_ws, fake_friends):
	graph = fake_friends({3: {1, 2, 5}})
	await manager.connect(1, "app", fake_ws())
	await manager.connect(5, "game", fake_ws(), match_id=12) # em partida sem /ws/app: offline
	assert await online_friends(manager, graph, 3) == [1]


# ---------- DbFriendGraph, contra o Postgres ----------

@pytest.fixture
def db_graph(db_session):
	@asynccontextmanager
	async def sessions():
		yield db_session # a sessão do teste, que sofre rollback no fim

	return DbFriendGraph(sessions)


async def add_users(db_session, *names: str) -> list[int]:
	users = [User(email=f"{name}@example.com", username=name) for name in names]
	db_session.add_all(users)
	await db_session.flush()
	return [user.id for user in users]


async def test_db_graph_reads_both_directions(db_session, db_graph):
	ana, bia, caio = await add_users(db_session, "ana", "bia", "caio")
	db_session.add_all([Friendship(user_id=ana, friend_id=bia),
		Friendship(user_id=caio, friend_id=bia), Friendship(user_id=ana, friend_id=caio)])
	await db_session.flush()

	assert sorted(await db_graph.friends_of(ana)) == [bia, caio]
	assert sorted(await db_graph.watchers_of(bia)) == [ana, caio]
	assert await db_graph.watchers_of(ana) == []


async def test_db_graph_marks_last_seen(db_session, db_graph):
	[ana] = await add_users(db_session, "ana")
	assert await db_session.scalar(select(User.last_seen_at).where(User.id == ana)) is None
	await db_graph.mark_seen(ana)
	db_session.expire_all()
	assert await db_session.scalar(select(User.last_seen_at).where(User.id == ana)) is not None
