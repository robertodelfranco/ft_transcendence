# backend/tests/game/test_rooms.py
# RoomManager contra rooms.md §2.2 e §2.3: o Lobby em memória e a task do tick, com mapas próprios.
import asyncio
import json
import re
from collections.abc import Callable
from pathlib import Path

import pytest

import app.game.rooms as rooms
from app.game import Mode, RoomOptions, set_connected
from app.game.protocol import CloseCode
from app.game.rooms import (AlreadyIn, AlreadyInOtherMatch, AlreadyStarted, NotEnoughPlayers,
	NotInRoom, RoomError, RoomFull, RoomManager, RoomNotFound, get_room_manager)
from app.game.world import parse_map
from app.ws.manager import ConnectionManager


pytestmark = pytest.mark.anyio

CONTRACTS = Path(__file__).resolve().parents[3] / "docs" / "contracts"
MAPS = { # sem Enemy e sem Boss: o que se testa aqui é o registro, não a Simulation
	Mode.COOP: "1111111\n1NNNNN1\n1111111\n",
	Mode.PVP: "11111\n1N0S1\n11111\n",
}
AVATAR = "/media/avatars/default.png"


def load_test_map(name: str, mode: Mode):
	return parse_map(MAPS[mode], name, mode)


@pytest.fixture
async def connections():
	connections = ConnectionManager(close_timeout_s=0.05)
	yield connections
	await connections.close_all(1000)


@pytest.fixture
async def manager(connections):
	manager = RoomManager(connections, load=load_test_map)
	yield manager
	await manager.close() # nenhuma task de tick sobra para o próximo teste


def lobby(manager: RoomManager, match_id: int = 12, mode: Mode = Mode.COOP, max_players: int = 5,
		players: tuple[int, ...] = (7,)) -> None:
	# o que o POST /api/matches faz: create e logo depois o join do criador
	manager.create(match_id, mode, "arena", max_players, RoomOptions(), created_by=players[0])
	for user_id in players:
		manager.join(match_id, user_id, f"user{user_id}", AVATAR)


async def until(condition: Callable[[], bool], timeout: float = 1.0) -> None:
	async with asyncio.timeout(timeout):
		while not condition():
			await asyncio.sleep(0.005)


def room_tasks() -> list[asyncio.Task]:
	return [task for task in asyncio.all_tasks() if task.get_name().startswith("room-")]


# ---------- contrato ----------

def contract_exceptions() -> dict[str, str]:
	# a tabela de exceções de rooms.md §2.2: nome → code na API
	text = (CONTRACTS / "rooms.md").read_text(encoding="utf-8")
	section = text.split("### 2.2", 1)[1].split("\n### ", 1)[0]
	return dict(re.findall(r"^\| `(\w+)` \| .+ \| `(\w+)` \|$", section, re.M))


def test_exceptions_carry_the_contract_codes():
	assert {error.__name__: error.code for error in RoomError.__subclasses__()} == contract_exceptions()
	assert RoomNotFound.status_code == 404
	assert {error.status_code for error in RoomError.__subclasses__() if error is not RoomNotFound} == {409}


async def test_room_info_has_the_shape_of_the_contract_example(manager):
	text = (CONTRACTS / "matches-api.md").read_text(encoding="utf-8")
	example = json.loads(re.search(r"```json\n(.*?)```", text.split("## 3.", 1)[1], re.S).group(1))
	lobby(manager)
	payload = manager.info(12).to_payload()
	assert payload.keys() == example.keys()
	assert payload["players"][0].keys() == example["players"][0].keys()
	assert payload["options"] == example["options"] # coop: sem as opções do pvp
	assert payload["created_at"].endswith("Z")


# ---------- Lobby ----------

async def test_create_makes_an_empty_lobby_without_a_task(manager):
	manager.create(12, Mode.COOP, "arena", 5, RoomOptions(), created_by=7)
	info = manager.info(12)
	assert (info.status, info.map, info.min_players, info.players) == ("lobby", "arena", 1, ())
	assert manager.game_room(12) is None
	assert room_tasks() == []


@pytest.mark.parametrize("mode, max_players", [(Mode.COOP, 6), (Mode.COOP, 0), (Mode.PVP, 3)])
async def test_create_refuses_max_players_out_of_range(manager, mode, max_players):
	with pytest.raises(ValueError):
		manager.create(12, mode, "arena", max_players, RoomOptions(), created_by=7)


async def test_create_refuses_a_repeated_match_id(manager):
	lobby(manager)
	with pytest.raises(ValueError):
		manager.create(12, Mode.COOP, "arena", 5, RoomOptions(), created_by=9)


async def test_join_keeps_the_order_of_arrival(manager):
	lobby(manager, players=(7, 9, 15))
	info = manager.info(12)
	assert [p.user_id for p in info.players] == [7, 9, 15]
	assert all(p.connected and not p.ready for p in info.players)
	assert manager.room_of(9) == 12


async def test_join_refusals(manager):
	lobby(manager, max_players=2, players=(7, 9))
	lobby(manager, match_id=13, players=(15,))
	with pytest.raises(RoomNotFound):
		manager.join(99, 20, "x", AVATAR)
	with pytest.raises(AlreadyIn):
		manager.join(12, 7, "user7", AVATAR)
	with pytest.raises(AlreadyInOtherMatch):
		manager.join(12, 15, "user15", AVATAR)
	with pytest.raises(RoomFull, match="2/2"):
		manager.join(12, 20, "user20", AVATAR)


async def test_leave_of_the_host_passes_it_to_the_oldest(manager):
	lobby(manager, players=(7, 9, 15))
	info = manager.leave(12, 7)
	assert info.created_by == 9
	assert [p.user_id for p in info.players] == [9, 15]
	assert manager.room_of(7) is None


async def test_leave_of_the_last_destroys_the_room(manager):
	lobby(manager)
	assert manager.leave(12, 7) is None
	assert manager.list_open() == []
	with pytest.raises(RoomNotFound):
		manager.info(12)


async def test_leave_and_ready_of_someone_outside(manager):
	lobby(manager)
	with pytest.raises(NotInRoom):
		manager.leave(12, 9)
	with pytest.raises(NotInRoom):
		manager.set_ready(12, 9, True)


async def test_set_ready_lives_in_the_room(manager):
	lobby(manager, players=(7, 9))
	info = manager.set_ready(12, 9, True)
	assert [p.ready for p in info.players] == [False, True]


async def test_list_open_shows_only_lobbies(manager):
	lobby(manager, match_id=12)
	lobby(manager, match_id=13, players=(9,))
	manager.start(13)
	assert [info.match_id for info in manager.list_open()] == [12]


# ---------- start ----------

async def test_pvp_needs_two_players(manager):
	lobby(manager, mode=Mode.PVP, max_players=2)
	with pytest.raises(NotEnoughPlayers, match="1/2"):
		manager.start(12)


async def test_start_creates_the_simulation_room_in_order_of_arrival(manager):
	lobby(manager, players=(9, 7, 15))
	manager.start(12)
	room = manager.game_room(12)
	assert list(room.players) == [9, 7, 15]
	assert manager.info(12).status == "running"
	assert len(room_tasks()) == 1


async def test_nothing_changes_the_lobby_after_start(manager):
	lobby(manager, players=(7, 9))
	manager.start(12)
	for change in (lambda: manager.start(12), lambda: manager.join(12, 15, "x", AVATAR),
			lambda: manager.leave(12, 9), lambda: manager.set_ready(12, 9, True)):
		with pytest.raises(AlreadyStarted):
			change()
	assert manager.room_of(9) == 12 # em andamento, continua preso a esta partida


async def test_connected_comes_from_the_simulation_after_start(manager):
	lobby(manager, players=(7, 9))
	manager.start(12)
	set_connected(manager.game_room(12), 7, True)
	assert [p.connected for p in manager.info(12).players] == [True, False]


# ---------- o tick ----------

async def test_tick_sends_events_and_a_snapshot_every_two_ticks(manager, connections, fake_ws):
	lobby(manager, players=(7, 9))
	manager.start(12)
	room = manager.game_room(12)
	ws7, ws9 = fake_ws(), fake_ws()
	await connections.connect(7, "game", ws7, match_id=12)
	await connections.connect(9, "game", ws9, match_id=12)
	set_connected(room, 7, True)
	set_connected(room, 9, True)
	await until(lambda: sum(m["type"] == "snapshot" for m in ws7.messages) >= 3)

	joined = [m for m in ws9.messages if m["type"] == "event"]
	assert [(m["name"], m["data"]["player_id"]) for m in joined] == [("player_joined", 7), ("player_joined", 9)]
	snapshots = [m for m in ws7.messages if m["type"] == "snapshot"]
	assert all(m["tick"] % 2 == 0 for m in snapshots)
	ticks = [m["tick"] for m in snapshots]
	assert all(later - earlier == 2 for earlier, later in zip(ticks, ticks[1:]))
	assert all(m["last_input_seq"] == 0 for m in snapshots)


async def test_game_over_ends_the_task_and_frees_the_players(manager):
	lobby(manager, players=(7, 9))
	manager.start(12)
	(task,) = room_tasks()
	manager.game_room(12).result = {"result": "win", "winner_ids": [7, 9], "reason": "boss_defeated"}
	await until(task.done)
	assert manager.info(12).status == "finished"
	assert (manager.room_of(7), manager.room_of(9)) == (None, None)


async def test_one_failing_step_is_logged_and_the_room_goes_on(manager, monkeypatch, caplog):
	real_step = rooms.step
	calls = 0

	def flaky_step(room, dt):
		nonlocal calls
		calls += 1
		if calls == 1:
			raise RuntimeError("boom")
		return real_step(room, dt)

	monkeypatch.setattr(rooms, "step", flaky_step)
	lobby(manager)
	manager.start(12)
	await until(lambda: manager.game_room(12).tick >= 3)
	assert manager.info(12).status == "running"
	assert "tick failed" in caplog.text


async def test_repeated_failures_close_the_room_with_4503(manager, connections, fake_ws, monkeypatch):
	def broken_step(room, dt):
		raise RuntimeError("boom")

	monkeypatch.setattr(rooms, "step", broken_step)
	monkeypatch.setattr(rooms, "MAX_STEP_FAILURES", 3)
	lobby(manager, players=(7, 9))
	ws = fake_ws()
	other = fake_ws() # o socket de outra partida não pode cair junto
	await connections.connect(7, "game", ws, match_id=12)
	await connections.connect(9, "game", other, match_id=13)
	manager.start(12)
	await until(lambda: ws.close_code is not None)

	assert ws.close_code == CloseCode.SERVER_SHUTDOWN
	assert ws.messages[-1]["code"] == "server_shutdown"
	assert other.close_code is None
	assert manager.room_of(7) is None
	with pytest.raises(RoomNotFound):
		manager.info(12)


async def test_a_snapshot_that_always_fails_also_closes_the_room(manager, connections, fake_ws,
		monkeypatch):
	# só os Ticks pares montam Snapshot: os ímpares passam e não podem zerar a contagem
	def broken_snapshot(room):
		raise ValueError("Out of range float values are not JSON compliant")

	monkeypatch.setattr(rooms, "to_snapshot", broken_snapshot)
	monkeypatch.setattr(rooms, "MAX_STEP_FAILURES", 3)
	lobby(manager)
	ws = fake_ws()
	await connections.connect(7, "game", ws, match_id=12)
	manager.start(12)
	await until(lambda: ws.close_code is not None)

	assert ws.close_code == CloseCode.SERVER_SHUTDOWN
	assert not any(m["type"] == "snapshot" for m in ws.messages)


async def test_close_cancels_every_tick_task(manager):
	lobby(manager, match_id=12)
	lobby(manager, match_id=13, players=(9,))
	manager.start(12)
	manager.start(13)
	tasks = room_tasks()
	await manager.close()
	assert len(tasks) == 2 and all(task.cancelled() for task in tasks)
	assert room_tasks() == []


# ---------- app ----------

async def test_the_app_hands_its_room_manager_to_the_routes(app):
	request = type("Request", (), {"app": app})() # get_room_manager só lê connection.app
	assert isinstance(get_room_manager(request), RoomManager)
