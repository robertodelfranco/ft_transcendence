# backend/tests/game/test_rooms.py
# RoomManager contra rooms.md §2.2 e §2.3: o Lobby em memória e a task do tick, com mapas próprios.
import asyncio
import json
import re
from collections.abc import Callable
from pathlib import Path

import pytest

import app.game.rooms as rooms
from app.game import MatchOutcome, Mode, RoomOptions, set_connected
from app.game.protocol import CloseCode
from app.game.rooms import (AlreadyIn, AlreadyInOtherMatch, AlreadyStarted, NotEnoughPlayers,
	NotInRoom, RoomError, RoomFull, RoomManager, RoomNotFound, get_room_manager)
from app.core.request_id import current_request_id
from app.game.world import parse_map
from app.matches.results import AchievementUnlock
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


class FakeResults:
	"""O banco do fim de partida (app/matches/results.py): guarda as chamadas, sem sessão."""

	def __init__(self) -> None:
		self.recorded: list[tuple] = []
		self.aborted: list[int] = []
		self.unlocks: list[AchievementUnlock] = []
		self.fail = False

	async def record(self, match_id, outcome, ended_at):
		self.recorded.append((match_id, outcome, ended_at))
		if self.fail:
			raise ConnectionError("database down")
		return self.unlocks

	async def abort(self, match_id):
		self.aborted.append(match_id)
		return 1


@pytest.fixture
def results() -> FakeResults:
	return FakeResults()


@pytest.fixture
async def manager(connections, results, monkeypatch):
	monkeypatch.setattr(rooms, "DYING_TICKS", 2) # a animação do Boss sem esperar 1,2 s
	manager = RoomManager(connections, load=load_test_map, record=results.record, abort=results.abort)
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


def end_game(manager: RoomManager, match_id: int = 12) -> None:
	"""Termina a partida pela porta, como o CoopRuleset faria: game_over com o MatchOutcome."""
	room = manager.game_room(match_id)
	room.result = {"result": "win", "winner_ids": sorted(room.players), "reason": "boss_defeated"}
	room.outcome = MatchOutcome(result="win", reason="boss_defeated",
		winner_ids=tuple(sorted(room.players)), duration_ticks=room.tick, players=())


async def test_game_over_records_the_match_once_even_with_ticks_after(manager, results):
	lobby(manager, players=(7, 9))
	manager.start(12)
	room = manager.game_room(12)
	end_game(manager)
	end_tick = room.tick + rooms.DYING_TICKS + 1 # +1: o game_over só é visto no Tick seguinte
	await until(lambda: room.tick >= end_tick)

	((match_id, outcome, ended_at),) = results.recorded
	assert (match_id, outcome) == (12, room.outcome)
	assert ended_at.tzinfo is not None
	assert manager.info(12).status == "finished" # a Room fica 60 s, com o estado final


async def test_game_over_frees_the_players_before_the_animation_ends(manager, monkeypatch):
	monkeypatch.setattr(rooms, "DYING_TICKS", 10_000)
	lobby(manager, players=(7, 9))
	manager.start(12)
	(task,) = room_tasks()
	end_game(manager)
	await until(lambda: manager.room_of(7) is None)
	assert manager.room_of(9) is None
	assert manager.info(12).status == "finished"
	assert not task.done() # a animação do Boss continua andando


async def test_the_ticks_after_game_over_stop_after_the_animation(manager):
	# nos 60 s seguintes a Room só espera: nada de 30 Hz de CPU e Snapshot para uma partida acabada
	lobby(manager)
	manager.start(12)
	room = manager.game_room(12)
	end_game(manager)
	game_over_tick = room.tick
	await asyncio.sleep((rooms.DYING_TICKS + 5) / rooms.TICK_RATE)
	stopped_at = room.tick
	await asyncio.sleep(5 / rooms.TICK_RATE)
	assert room.tick == stopped_at <= game_over_tick + 1 + rooms.DYING_TICKS


async def test_the_room_is_removed_after_its_ttl(manager, monkeypatch):
	monkeypatch.setattr(rooms, "ROOM_TTL_S", 0)
	lobby(manager)
	manager.start(12)
	(task,) = room_tasks()
	end_game(manager)
	await until(task.done)
	assert task.exception() is None
	with pytest.raises(RoomNotFound):
		manager.info(12)
	assert manager.game_room(12) is None


async def test_unlocked_achievements_go_to_the_players(manager, connections, fake_ws, results):
	results.unlocks = [AchievementUnlock(user_id=7, code="first_win")]
	lobby(manager, players=(7, 9))
	ws7, ws9 = fake_ws(), fake_ws()
	await connections.connect(7, "game", ws7, match_id=12)
	await connections.connect(9, "game", ws9, match_id=12)
	manager.start(12)
	end_game(manager)
	await until(lambda: manager.room_of(7) is None)

	for ws in (ws7, ws9):
		(event,) = [m for m in ws.messages if m.get("name") == "achievement_unlocked"]
		assert event["data"] == {"user_id": 7, "code": "first_win"}


async def test_a_failed_record_is_logged_and_the_room_still_ends(manager, results, monkeypatch, caplog):
	monkeypatch.setattr(rooms, "ROOM_TTL_S", 0)
	results.fail = True
	lobby(manager)
	manager.start(12)
	(task,) = room_tasks()
	end_game(manager)
	await until(task.done)
	assert len(results.recorded) == 1 # sem retry
	assert "match result not recorded" in caplog.text
	with pytest.raises(RoomNotFound):
		manager.info(12)


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


async def test_repeated_failures_close_the_room_with_4503(manager, connections, fake_ws, monkeypatch,
		results):
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
	assert results.aborted == [12] # o Match vira aborted no banco
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


async def test_a_failed_abort_is_logged_and_the_room_still_closes(manager, connections, fake_ws,
		results, monkeypatch, caplog):
	async def broken_abort(match_id):
		raise ConnectionError("database down")

	def broken_step(room, dt):
		raise RuntimeError("boom")

	monkeypatch.setattr(rooms, "step", broken_step)
	monkeypatch.setattr(rooms, "MAX_STEP_FAILURES", 3)
	monkeypatch.setattr(manager, "_abort_match", broken_abort)
	lobby(manager)
	ws = fake_ws()
	await connections.connect(7, "game", ws, match_id=12)
	manager.start(12)
	(task,) = room_tasks()
	await until(task.done)
	assert ws.close_code == CloseCode.SERVER_SHUTDOWN
	assert "match abort not recorded" in caplog.text


async def test_the_tick_task_does_not_carry_the_request_id_of_the_start(manager):
	# o start roda dentro do POST /start; o log do tick não pode sair com o id daquela requisição
	lobby(manager)
	token = current_request_id.set("3f2b9c00-0000-4000-8000-000000000000")
	try:
		manager.start(12)
	finally:
		current_request_id.reset(token)
	(task,) = room_tasks()
	assert current_request_id not in task.get_context()


async def test_close_cancels_every_tick_task(manager):
	lobby(manager, match_id=12)
	lobby(manager, match_id=13, players=(9,))
	manager.start(12)
	manager.start(13)
	tasks = room_tasks()
	await manager.close()
	assert len(tasks) == 2 and all(task.cancelled() for task in tasks)
	assert room_tasks() == []


async def test_close_also_cancels_a_finished_room_waiting_its_ttl(manager):
	lobby(manager)
	manager.start(12)
	(task,) = room_tasks()
	end_game(manager)
	await until(lambda: manager.room_of(7) is None)
	await manager.close()
	assert task.cancelled()


# ---------- Grace period (F2.10, arq. §7.3) ----------

@pytest.fixture
def short_grace(monkeypatch):
	monkeypatch.setattr(rooms, "GRACE_TICKS", 6) # 0,2 s em vez de 30 s


def events_of(ws, user_id: int) -> list[str]:
	return [m["name"] for m in ws.messages
		if m["type"] == "event" and m["data"].get("player_id") == user_id]


async def test_coming_back_within_the_grace_period_keeps_the_player(manager, connections, fake_ws,
		short_grace):
	lobby(manager, players=(7, 9))
	manager.start(12)
	room = manager.game_room(12)
	ws9 = fake_ws()
	await connections.connect(9, "game", ws9, match_id=12)
	manager.player_connected(12, 9)
	manager.player_connected(12, 7)
	room.players[7].hp, room.players[7].keys = 4, 2
	deadline = room.tick + rooms.GRACE_TICKS
	manager.player_disconnected(12, 7)
	await until(lambda: room.tick >= deadline - 3)
	manager.player_connected(12, 7)
	await until(lambda: room.tick >= deadline + 3)

	player = room.players[7]
	assert player.connected and not player.left
	assert (player.hp, player.keys) == (4, 2)
	assert manager.room_of(7) == 12
	assert events_of(ws9, 7) == ["player_joined", "player_disconnected", "player_reconnected"]


async def test_the_grace_period_expiring_takes_the_player_out_of_a_coop(manager, connections,
		fake_ws, short_grace):
	lobby(manager, players=(7, 9))
	manager.start(12)
	room = manager.game_room(12)
	ws9 = fake_ws()
	await connections.connect(9, "game", ws9, match_id=12)
	manager.player_connected(12, 9)
	manager.player_connected(12, 7)
	manager.player_disconnected(12, 7)
	await until(lambda: "player_left" in events_of(ws9, 7))

	assert room.players[7].left
	assert manager.room_of(7) is None # livre para entrar em outra Room
	assert manager.room_of(9) == 12
	assert room.result is None # quem ficou continua jogando


async def test_everyone_expiring_ends_the_coop_with_a_forfeit(manager, results, short_grace):
	lobby(manager, players=(7, 9))
	manager.start(12)
	for user_id in (7, 9):
		manager.player_connected(12, user_id)
		manager.player_disconnected(12, user_id)
	await until(lambda: results.recorded)

	((_, outcome, _),) = results.recorded
	assert (outcome.result, outcome.reason) == ("loss", "forfeit")
	assert all(player.disconnected_at_end for player in outcome.players)


async def test_who_never_opens_the_socket_expires_counting_from_the_start(manager, short_grace):
	lobby(manager, players=(7, 9))
	manager.start(12)
	room = manager.game_room(12)
	manager.player_connected(12, 9)
	await until(lambda: room.players[7].left)
	assert room.tick > rooms.GRACE_TICKS
	assert not room.players[9].left


async def test_a_disconnect_after_game_over_starts_no_grace_period(manager, monkeypatch,
		short_grace):
	monkeypatch.setattr(rooms, "DYING_TICKS", 10_000) # o Tick continua andando depois do game_over
	lobby(manager)
	manager.start(12)
	room = manager.game_room(12)
	manager.player_connected(12, 7)
	end_game(manager)
	await until(lambda: manager.info(12).status == "finished")
	manager.player_disconnected(12, 7)
	ticks = room.tick
	await until(lambda: room.tick >= ticks + rooms.GRACE_TICKS + 3)
	assert not room.players[7].left


async def test_a_disconnect_from_a_removed_room_is_not_an_error(manager):
	manager.player_disconnected(99, 7)


# ---------- app ----------

async def test_the_app_hands_its_room_manager_to_the_routes(app):
	request = type("Request", (), {"app": app})() # get_room_manager só lê connection.app
	assert isinstance(get_room_manager(request), RoomManager)
