# backend/tests/matches/test_lobby.py
# Rotas de lobby e GET /api/maps (matches-api.md §2.2) contra o Postgres, com a Room em memória.
import asyncio

import pytest
from sqlalchemy import func, select

import app.matches.service as service
from app.auth.models import User
from app.auth.security import create_access_token
from app.game import Mode
from app.game.rooms import RoomManager
from app.game.world import parse_map
from app.matches.models import Match
from app.matches.service import MapInfo, load_catalog


pytestmark = pytest.mark.anyio

MAPS = { # sem Enemy e sem Boss: o que se testa aqui é o lobby, não a Simulation
	Mode.COOP: "1111111\n1NNNNN1\n1111111\n", # 5 Spawns
	Mode.PVP: "11111\n1N0S1\n11111\n", # 2 Spawns
}
CATALOG = {Mode.COOP: [MapInfo("arena", 5)], Mode.PVP: [MapInfo("duel", 2)]}
COOP = {"mode": "coop", "map": "arena"}


def load_test_map(name: str, mode: Mode):
	return parse_map(MAPS[mode], name, mode)


@pytest.fixture
async def rooms(app):
	app.state.room_manager = RoomManager(app.state.connection_manager, load=load_test_map)
	app.state.maps = CATALOG
	yield app.state.room_manager
	await app.state.room_manager.close() # o start liga a task do tick


WATCHER_ID = 10_000 # só olha o lobby; não é User do banco, e o manager não consulta ninguém


@pytest.fixture
async def watcher(app, fake_ws, fake_friends):
	"""Uma aba /ws/app de quem não está na Room: recebe todo lobby_update e lobby_removed."""
	app.state.friend_graph = fake_friends() # a presença do connect não vai ao banco
	ws = fake_ws()
	await app.state.connection_manager.connect(WATCHER_ID, "app", ws)
	yield ws
	await app.state.connection_manager.close_all(1000)


async def received(ws, count: int) -> list[dict]:
	"""Espera `count` mensagens (cada conexão escreve na própria task) e confere que não veio outra."""
	async with asyncio.timeout(1):
		while len(ws.sent) < count:
			await asyncio.sleep(0)
	for _ in range(10):
		await asyncio.sleep(0)
	assert len(ws.sent) == count
	return ws.messages


async def new_user(db_session, app, name: str = "akita") -> dict[str, str]:
	user = User(email=f"{name}@example.com", username=name)
	db_session.add(user)
	await db_session.flush()
	secret = app.state.settings.jwt_secret.get_secret_value()
	return {"Authorization": f"Bearer {create_access_token(user.id, secret, 900)}"}


async def count_matches(db_session) -> int:
	return await db_session.scalar(select(func.count()).select_from(Match))


# ---------- criar ----------

async def test_defaults_create_a_playable_lobby(client, db_session, app, rooms):
	headers = await new_user(db_session, app)
	response = await client.post("/api/matches", json=COOP, headers=headers)
	assert response.status_code == 201
	body = response.json()
	assert (body["mode"], body["map"], body["status"]) == ("coop", "arena", "lobby")
	assert (body["max_players"], body["min_players"]) == (5, 1) # sem max_players: o teto do Map
	assert body["options"] == {"theme": "dungeon", "start_hp": 10,
		"pickups": {"potion": True, "mana": True, "armor": True}}
	assert [p["username"] for p in body["players"]] == ["akita"]
	assert body["players"][0]["avatar_url"] == "/media/avatars/default.png"
	assert body["created_by"] == body["players"][0]["user_id"]

	row = await db_session.get(Match, body["match_id"])
	assert (row.status, row.mode, row.map, row.max_players) == ("lobby", "coop", "arena", 5)
	assert row.created_by == body["created_by"]
	assert row.options == body["options"] # normalizadas, com os defaults
	assert [info.match_id for info in rooms.list_open()] == [body["match_id"]]


async def test_explicit_options_and_max_players_are_kept(client, db_session, app, rooms):
	headers = await new_user(db_session, app)
	response = await client.post("/api/matches", headers=headers, json={
		"mode": "pvp", "map": "duel", "max_players": 2,
		"options": {"theme": "sewer", "frag_limit": 7}})
	assert response.status_code == 201
	options = response.json()["options"]
	assert (options["theme"], options["frag_limit"], options["time_limit_s"]) == ("sewer", 7, 180)
	assert response.json()["min_players"] == 2


async def test_unknown_map_is_404_and_writes_nothing(client, db_session, app, rooms):
	headers = await new_user(db_session, app)
	response = await client.post("/api/matches", json={**COOP, "map": "nope"}, headers=headers)
	assert (response.status_code, response.json()["error"]["code"]) == (404, "map_not_found")
	assert await count_matches(db_session) == 0 and rooms.list_open() == []


@pytest.mark.parametrize("mode, map_name, max_players", [
	("coop", "arena", 6), # acima dos Spawns
	("coop", "arena", 0),
	("pvp", "duel", 1), # pvp precisa de dois
])
async def test_max_players_outside_the_map_is_422(client, db_session, app, rooms,
		mode, map_name, max_players):
	headers = await new_user(db_session, app)
	response = await client.post("/api/matches", headers=headers,
		json={"mode": mode, "map": map_name, "max_players": max_players})
	error = response.json()["error"]
	assert (response.status_code, error["code"]) == (422, "invalid_options")
	assert error["fields"] == {"max_players": "invalid_value"}
	assert await count_matches(db_session) == 0


async def test_invalid_options_are_422_with_fields_and_write_nothing(client, db_session, app, rooms):
	headers = await new_user(db_session, app)
	response = await client.post("/api/matches", headers=headers,
		json={**COOP, "options": {"start_hp": 99, "frag_limit": 5}})
	error = response.json()["error"]
	assert (response.status_code, error["code"]) == (422, "invalid_options")
	assert error["fields"] == {"start_hp": "invalid_value", "frag_limit": "invalid_value"}
	assert await count_matches(db_session) == 0 and rooms.list_open() == []


async def test_a_user_in_a_room_cannot_create_another(client, db_session, app, rooms):
	headers = await new_user(db_session, app)
	await client.post("/api/matches", json=COOP, headers=headers)
	response = await client.post("/api/matches", json=COOP, headers=headers)
	assert (response.status_code, response.json()["error"]["code"]) == (409, "already_in_other_match")
	assert await count_matches(db_session) == 1 # sem Match órfão
	assert len(rooms.list_open()) == 1


async def test_a_failed_commit_leaves_no_room(client, db_session, app, rooms, watcher, monkeypatch):
	headers = await new_user(db_session, app)

	async def broken_commit():
		raise ConnectionError("database went away")

	monkeypatch.setattr(db_session, "commit", broken_commit)
	response = await client.post("/api/matches", json=COOP, headers=headers)
	assert response.status_code == 500
	assert rooms.list_open() == [] # a Room nunca vive sem linha
	assert rooms.room_of(1) is None
	assert await received(watcher, 0) == [] # nada publicado antes do commit


@pytest.mark.parametrize("headers", [{}, {"Authorization": "Bearer not-a-jwt"}])
async def test_creating_needs_a_valid_token(client, db_session, rooms, headers):
	response = await client.post("/api/matches", json=COOP, headers=headers)
	assert (response.status_code, response.json()["error"]["code"]) == (401, "unauthorized")


# ---------- catálogo ----------

async def test_maps_lists_each_mode(client, db_session, app, rooms):
	headers = await new_user(db_session, app)
	response = await client.get("/api/maps", headers=headers)
	assert response.status_code == 200
	assert response.json() == {"coop": [{"name": "arena", "max_players": 5}],
		"pvp": [{"name": "duel", "max_players": 2}]}


async def test_maps_needs_a_token(client, db_session, rooms):
	assert (await client.get("/api/maps")).status_code == 401


def test_catalog_is_sorted_and_capped_by_spawns(tmp_path, monkeypatch):
	for mode in Mode:
		(tmp_path / mode).mkdir()
	for name in ("zeta", "alfa"):
		(tmp_path / "coop" / f"{name}.txt").write_text("x")
	(tmp_path / "pvp" / "duel.txt").write_text("x")
	monkeypatch.setattr(service, "load_map", lambda name, mode, *, maps_dir: load_test_map(name, mode))
	catalog = load_catalog(tmp_path)
	assert [info.name for info in catalog[Mode.COOP]] == ["alfa", "zeta"]
	assert catalog[Mode.COOP][0].max_players == 5 and catalog[Mode.PVP][0].max_players == 2


def test_catalog_without_map_folders_is_empty(tmp_path):
	assert load_catalog(tmp_path) == {Mode.COOP: [], Mode.PVP: []}


# ---------- lobby ----------

PVP = {"mode": "pvp", "map": "duel"}


def error(response) -> tuple[int, str]:
	return response.status_code, response.json()["error"]["code"]


async def open_lobby(client, db_session, app, body=COOP) -> tuple[int, dict[str, str]]:
	headers = await new_user(db_session, app)
	response = await client.post("/api/matches", json=body, headers=headers)
	return response.json()["match_id"], headers


async def match_row(db_session, match_id: int):
	# lê do banco, não do identity map da sessão
	query = select(Match.status, Match.created_by, Match.started_at).where(Match.id == match_id)
	return (await db_session.execute(query)).one()


async def test_list_shows_open_lobbies_by_mode(client, db_session, app, rooms):
	match_id, headers = await open_lobby(client, db_session, app)
	items = (await client.get("/api/matches", headers=headers)).json()["items"]
	assert [room["match_id"] for room in items] == [match_id]
	assert (await client.get("/api/matches?mode=pvp", headers=headers)).json() == {"items": []}


async def test_get_returns_the_live_room_or_404(client, db_session, app, rooms):
	match_id, headers = await open_lobby(client, db_session, app)
	assert (await client.get(f"/api/matches/{match_id}", headers=headers)).json()["match_id"] == match_id
	assert error(await client.get(f"/api/matches/{match_id + 1}", headers=headers)) == (404, "match_not_found")


async def test_join_fills_the_room_and_refuses_the_rest(client, db_session, app, rooms):
	match_id, _ = await open_lobby(client, db_session, app, PVP)
	guest = await new_user(db_session, app, "rdel")
	response = await client.post(f"/api/matches/{match_id}/join", headers=guest)
	assert [p["username"] for p in response.json()["players"]] == ["akita", "rdel"]
	assert error(await client.post(f"/api/matches/{match_id}/join", headers=guest)) == (409, "already_in")
	late = await new_user(db_session, app, "caio")
	assert error(await client.post(f"/api/matches/{match_id}/join", headers=late)) == (409, "room_full")


async def test_host_leaving_passes_the_host_on(client, db_session, app, rooms):
	match_id, host = await open_lobby(client, db_session, app)
	guest = await new_user(db_session, app, "rdel")
	guest_id = (await client.post(f"/api/matches/{match_id}/join", headers=guest)).json()["players"][1]["user_id"]
	assert (await client.post(f"/api/matches/{match_id}/leave", headers=host)).status_code == 204
	assert rooms.info(match_id).created_by == guest_id
	assert (await match_row(db_session, match_id)).created_by == guest_id


async def test_last_one_out_aborts_the_match(client, db_session, app, rooms):
	match_id, host = await open_lobby(client, db_session, app)
	outsider = await new_user(db_session, app, "rdel")
	assert error(await client.post(f"/api/matches/{match_id}/leave", headers=outsider)) == (409, "not_in_match")
	assert (await client.post(f"/api/matches/{match_id}/leave", headers=host)).status_code == 204
	assert rooms.list_open() == []
	assert (await match_row(db_session, match_id)).status == "aborted"


async def test_ready_is_a_strict_bool_for_players_only(client, db_session, app, rooms):
	match_id, host = await open_lobby(client, db_session, app)
	response = await client.post(f"/api/matches/{match_id}/ready", json={"ready": True}, headers=host)
	assert response.json()["players"][0]["ready"] is True
	assert error(await client.post(f"/api/matches/{match_id}/ready", json={"ready": "yes"},
		headers=host)) == (422, "validation_error")
	outsider = await new_user(db_session, app, "rdel")
	assert error(await client.post(f"/api/matches/{match_id}/ready", json={"ready": True},
		headers=outsider)) == (409, "not_in_match")


async def test_only_the_host_starts_and_only_once(client, db_session, app, rooms):
	match_id, host = await open_lobby(client, db_session, app)
	guest = await new_user(db_session, app, "rdel")
	await client.post(f"/api/matches/{match_id}/join", headers=guest)
	assert error(await client.post(f"/api/matches/{match_id}/start", headers=guest)) == (403, "not_host")
	assert (await client.post(f"/api/matches/{match_id}/start", headers=host)).status_code == 204
	row = await match_row(db_session, match_id)
	assert row.status == "running" and row.started_at is not None
	assert rooms.list_open() == []
	assert error(await client.post(f"/api/matches/{match_id}/start", headers=host)) == (409, "already_started")
	assert error(await client.post(f"/api/matches/{match_id}/leave", headers=guest)) == (409, "already_started")


async def test_pvp_needs_two_to_start(client, db_session, app, rooms):
	match_id, host = await open_lobby(client, db_session, app, PVP)
	assert error(await client.post(f"/api/matches/{match_id}/start", headers=host)) == (409, "not_enough_players")


# ---------- lobby ao vivo (ws-manager.md §2.5) ----------

async def test_create_join_and_ready_reach_every_tab(client, db_session, app, rooms, watcher):
	match_id, _ = await open_lobby(client, db_session, app)
	guest = await new_user(db_session, app, "rdel")
	await client.post(f"/api/matches/{match_id}/join", headers=guest)
	await client.post(f"/api/matches/{match_id}/ready", json={"ready": True}, headers=guest)
	assert error(await client.post(f"/api/matches/{match_id}/join", headers=guest)) == (409, "already_in")

	created, joined, ready = await received(watcher, 3) # o join recusado não publica
	assert {m["type"] for m in (created, joined, ready)} == {"lobby_update"}
	assert created["room"]["match_id"] == match_id
	assert [p["username"] for p in joined["room"]["players"]] == ["akita", "rdel"]
	assert ready["room"]["players"][1]["ready"] is True


async def test_leaving_updates_the_room_and_the_last_one_out_removes_it(client, db_session, app,
		rooms, watcher):
	match_id, host = await open_lobby(client, db_session, app)
	guest = await new_user(db_session, app, "rdel")
	guest_id = (await client.post(f"/api/matches/{match_id}/join", headers=guest)).json()["players"][1]["user_id"]
	await client.post(f"/api/matches/{match_id}/leave", headers=host)
	await client.post(f"/api/matches/{match_id}/leave", headers=guest)

	*_, host_left, last_left = await received(watcher, 4)
	assert host_left["type"] == "lobby_update" and host_left["room"]["created_by"] == guest_id
	assert last_left == {"v": 1, "type": "lobby_removed", "match_id": match_id, "reason": "aborted"}


async def test_start_tells_the_players_and_removes_the_room_for_everyone(client, db_session, app,
		rooms, watcher, fake_ws):
	match_id, host = await open_lobby(client, db_session, app)
	player_tab = fake_ws()
	await app.state.connection_manager.connect(rooms.info(match_id).created_by, "app", player_tab)
	await client.post(f"/api/matches/{match_id}/start", headers=host)

	started, removed = await received(player_tab, 2)
	assert started == {"v": 1, "type": "match_started", "match_id": match_id}
	assert removed == {"v": 1, "type": "lobby_removed", "match_id": match_id, "reason": "started"}
	assert (await received(watcher, 2))[1] == removed # quem não joga não recebe o match_started


# ---------- presença ----------

async def test_going_offline_leaves_the_lobby(client, db_session, app, rooms, watcher):
	match_id, _ = await open_lobby(client, db_session, app)
	host_id = rooms.info(match_id).created_by
	connections = app.state.connection_manager
	await service.leave_when_offline(rooms, connections, lambda: db_session, host_id, True)
	assert rooms.room_of(host_id) == match_id # voltar online não tira ninguém
	await service.leave_when_offline(rooms, connections, lambda: db_session, host_id, False)
	assert rooms.room_of(host_id) is None
	assert (await match_row(db_session, match_id)).status == "aborted"
	assert (await received(watcher, 2))[1]["reason"] == "aborted" # some da lista de todos


async def test_going_offline_in_a_running_match_keeps_the_seat(client, db_session, app, rooms):
	match_id, host = await open_lobby(client, db_session, app)
	host_id = rooms.info(match_id).created_by
	await client.post(f"/api/matches/{match_id}/start", headers=host)
	await service.leave_when_offline(rooms, app.state.connection_manager, lambda: db_session,
		host_id, False)
	assert rooms.room_of(host_id) == match_id # em partida, vale o Grace period
