# backend/tests/users/test_friends.py
# Amigos e busca de Users (i18n.md §2.7) contra o Postgres, com o online vindo do ConnectionManager.
import pytest
from sqlalchemy import select

from app.auth.models import Friendship, User
from app.auth.security import create_access_token


pytestmark = pytest.mark.anyio

FRIENDS = "/api/users/me/friends"


async def new_user(db_session, app, name: str) -> tuple[User, dict[str, str]]:
	user = User(email=f"{name}@example.com", username=name)
	db_session.add(user)
	await db_session.flush()
	secret = app.state.settings.jwt_secret.get_secret_value()
	return user, {"Authorization": f"Bearer {create_access_token(user.id, secret, 900)}"}


@pytest.fixture
async def online(app, fake_ws, fake_friends):
	"""Abre um /ws/app falso para o User, como uma aba aberta; fecha tudo no fim do teste."""
	app.state.friend_graph = fake_friends() # o aviso de presença do connect não vai ao banco
	manager = app.state.connection_manager

	async def open_tab(user: User) -> None:
		await manager.connect(user.id, "app", fake_ws())

	yield open_tab
	await manager.close_all(1000)


async def friendships(db_session, me: User) -> list[int]:
	return list(await db_session.scalars(
		select(Friendship.friend_id).where(Friendship.user_id == me.id).order_by(Friendship.friend_id)))


# ---------- PUT /api/users/me/friends/{user_id} ----------

async def test_add_returns_the_friend_offline(client, db_session, app):
	other, _ = await new_user(db_session, app, "roberto")
	me, auth = await new_user(db_session, app, "caio")
	response = await client.put(f"{FRIENDS}/{other.id}", headers=auth)
	assert response.status_code == 200
	body = response.json()
	assert body | {"created_at": "", "since": ""} == {"id": other.id, "username": "roberto",
		"avatar_url": "/media/avatars/default.png", "created_at": "", "online": False, "since": ""}
	assert await friendships(db_session, me) == [other.id]


async def test_add_a_friend_who_is_online(client, db_session, app, online):
	other, _ = await new_user(db_session, app, "roberto")
	_, auth = await new_user(db_session, app, "caio")
	await online(other)
	body = (await client.put(f"{FRIENDS}/{other.id}", headers=auth)).json()
	assert body["online"] is True


async def test_adding_again_keeps_the_first_since(client, db_session, app):
	other, _ = await new_user(db_session, app, "roberto")
	me, auth = await new_user(db_session, app, "caio")
	first = (await client.put(f"{FRIENDS}/{other.id}", headers=auth)).json()
	second = await client.put(f"{FRIENDS}/{other.id}", headers=auth)
	assert second.status_code == 200
	assert second.json()["since"] == first["since"]
	assert await friendships(db_session, me) == [other.id]


async def test_adding_yourself_is_409(client, db_session, app):
	me, auth = await new_user(db_session, app, "caio")
	response = await client.put(f"{FRIENDS}/{me.id}", headers=auth)
	assert (response.status_code, response.json()["error"]["code"]) == (409, "cannot_friend_self")
	assert await friendships(db_session, me) == []


@pytest.mark.parametrize("user_id, status, code", [
	("999999999", 404, "user_not_found"),
	("0", 422, "validation_error"),
	("99999999999999999999", 422, "validation_error"), # acima do BIGINT
])
async def test_add_unknown_ids(client, db_session, app, user_id, status, code):
	_, auth = await new_user(db_session, app, "caio")
	response = await client.put(f"{FRIENDS}/{user_id}", headers=auth)
	assert (response.status_code, response.json()["error"]["code"]) == (status, code)


async def test_the_added_user_sees_nothing(client, db_session, app):
	# amizade unilateral: eu adicionei ele, e para ele eu não sou amigo
	other, other_auth = await new_user(db_session, app, "roberto")
	_, auth = await new_user(db_session, app, "caio")
	await client.put(f"{FRIENDS}/{other.id}", headers=auth)
	assert (await client.get(FRIENDS, headers=other_auth)).json() == {"items": []}


# ---------- GET /api/users/me/friends ----------

async def test_list_is_sorted_by_username_with_presence(client, db_session, app, online):
	zeca, _ = await new_user(db_session, app, "zeca")
	akita, _ = await new_user(db_session, app, "akita")
	stranger, _ = await new_user(db_session, app, "rafael") # online, mas não é amigo
	me, auth = await new_user(db_session, app, "caio")
	db_session.add_all([Friendship(user_id=me.id, friend_id=zeca.id),
		Friendship(user_id=me.id, friend_id=akita.id)])
	await db_session.flush()
	await online(zeca)
	await online(stranger)
	items = (await client.get(FRIENDS, headers=auth)).json()["items"]
	assert [(item["username"], item["online"]) for item in items] == [("akita", False), ("zeca", True)]
	assert all(item["since"] for item in items)


async def test_list_needs_a_session(client):
	assert (await client.get(FRIENDS)).status_code == 401


# ---------- DELETE /api/users/me/friends/{user_id} ----------

async def test_remove_deletes_only_my_row(client, db_session, app):
	other, _ = await new_user(db_session, app, "roberto")
	me, auth = await new_user(db_session, app, "caio")
	db_session.add_all([Friendship(user_id=me.id, friend_id=other.id),
		Friendship(user_id=other.id, friend_id=me.id)])
	await db_session.flush()
	response = await client.delete(f"{FRIENDS}/{other.id}", headers=auth)
	assert (response.status_code, response.content) == (204, b"")
	assert await friendships(db_session, me) == []
	assert await friendships(db_session, other) == [me.id] # a dele continua


@pytest.mark.parametrize("target", ["stranger", "missing"])
async def test_remove_is_idempotent(client, db_session, app, target):
	other, _ = await new_user(db_session, app, "roberto")
	_, auth = await new_user(db_session, app, "caio")
	user_id = other.id if target == "stranger" else 999999999
	assert (await client.delete(f"{FRIENDS}/{user_id}", headers=auth)).status_code == 204


# ---------- GET /api/users?search= ----------

async def search(client, auth, query: str):
	return await client.get(f"/api/users?{query}", headers=auth)


async def test_search_by_prefix_sorted_and_without_me(client, db_session, app):
	for name in ["carla", "caio_42", "rafael", "cadu"]:
		await new_user(db_session, app, name)
	_, auth = await new_user(db_session, app, "caio")
	body = (await search(client, auth, "search=ca")).json()
	assert [user["username"] for user in body["items"]] == ["cadu", "caio_42", "carla"]
	assert set(body["items"][0]) == {"id", "username", "avatar_url", "created_at"} # PublicUser


async def test_underscore_is_not_a_wildcard(client, db_session, app):
	await new_user(db_session, app, "a_bc")
	await new_user(db_session, app, "axbc")
	_, auth = await new_user(db_session, app, "caio")
	body = (await search(client, auth, "search=a_")).json()
	assert [user["username"] for user in body["items"]] == ["a_bc"]


async def test_search_limit(client, db_session, app):
	for index in range(12):
		await new_user(db_session, app, f"user{index:02}")
	_, auth = await new_user(db_session, app, "caio")
	assert len((await search(client, auth, "search=user")).json()["items"]) == 10 # default
	assert len((await search(client, auth, "search=user&limit=3")).json()["items"]) == 3


@pytest.mark.parametrize("query, fields", [
	("", {"search": "required"}),
	("search=c", {"search": "too_short"}),
	(f"search={'a' * 21}", {"search": "too_long"}),
	("search=Caio", {"search": "invalid_format"}), # a casca manda em minúsculas
	("search=ca%25", {"search": "invalid_format"}), # o % do LIKE não passa da validação
	("search=ca&limit=21", {"limit": "invalid_value"}),
	("search=ca&limit=0", {"limit": "invalid_value"}),
])
async def test_invalid_searches_are_422(client, db_session, app, query, fields):
	_, auth = await new_user(db_session, app, "caio")
	response = await search(client, auth, query)
	assert response.status_code == 422
	error = response.json()["error"]
	assert (error["code"], error["fields"]) == ("validation_error", fields)


async def test_the_61st_search_in_a_minute_is_429(client, db_session, app):
	_, auth = await new_user(db_session, app, "caio")
	codes = [(await search(client, auth, "search=ca")).status_code for _ in range(61)]
	assert codes == [200] * 60 + [429]


async def test_search_needs_a_session(client):
	assert (await client.get("/api/users?search=ca")).status_code == 401
