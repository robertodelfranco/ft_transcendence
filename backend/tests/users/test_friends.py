# backend/tests/users/test_friends.py
# Amigos (i18n.md §2.7) contra o Postgres, com o online vindo do ConnectionManager.
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
