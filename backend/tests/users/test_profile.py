# backend/tests/users/test_profile.py
# PATCH /api/users/me e GET /api/users/{user_id} (i18n.md §2.7) contra o Postgres, com rollback no fim.
import pytest

from app.auth.models import Friendship, User
from app.auth.security import create_access_token


pytestmark = pytest.mark.anyio


async def new_user(db_session, app, name: str) -> tuple[User, dict[str, str]]:
	user = User(email=f"{name}@example.com", username=name)
	db_session.add(user)
	await db_session.flush()
	secret = app.state.settings.jwt_secret.get_secret_value()
	return user, {"Authorization": f"Bearer {create_access_token(user.id, secret, 900)}"}


# ---------- PATCH /api/users/me ----------

async def test_patch_changes_username_and_language(client, db_session, app):
	user, auth = await new_user(db_session, app, "caio")
	response = await client.patch("/api/users/me", headers=auth,
		json={"username": " Caio_42 ", "preferred_language": "pt-BR"})
	assert response.status_code == 200
	body = response.json()
	assert (body["username"], body["preferred_language"]) == ("caio_42", "pt-BR")
	assert body["email"] == "caio@example.com" # PrivateUser: é o próprio User que recebe
	await db_session.refresh(user)
	assert user.username == "caio_42"


async def test_patch_one_field_keeps_the_other(client, db_session, app):
	_, auth = await new_user(db_session, app, "caio")
	body = (await client.patch("/api/users/me", headers=auth, json={"preferred_language": "es"})).json()
	assert (body["username"], body["preferred_language"]) == ("caio", "es")


async def test_a_taken_username_is_409_and_changes_nothing(client, db_session, app):
	await new_user(db_session, app, "augusto")
	user, auth = await new_user(db_session, app, "caio")
	response = await client.patch("/api/users/me", headers=auth,
		json={"username": "augusto", "preferred_language": "es"})
	assert response.status_code == 409
	assert response.json()["error"]["code"] == "username_taken"
	await db_session.refresh(user)
	assert (user.username, user.preferred_language) == ("caio", "en") # o idioma também não mudou


@pytest.mark.parametrize("body, fields", [
	({}, {}), # ao menos um dos dois campos
	({"username": "ab"}, {"username": "too_short"}),
	({"username": "caio!"}, {"username": "invalid_format"}),
	({"preferred_language": "fr"}, {"preferred_language": "invalid_value"}),
	({"email": "novo@example.com"}, {"email": "invalid_value"}), # e-mail não se troca por aqui
])
async def test_invalid_bodies_are_422(client, db_session, app, body, fields):
	_, auth = await new_user(db_session, app, "caio")
	response = await client.patch("/api/users/me", headers=auth, json=body)
	assert response.status_code == 422
	error = response.json()["error"]
	assert (error["code"], error["fields"]) == ("validation_error", fields)


async def test_patch_needs_a_session(client):
	response = await client.patch("/api/users/me", json={"preferred_language": "es"})
	assert response.status_code == 401


# ---------- GET /api/users/{user_id} ----------

async def test_profile_of_a_friend(client, db_session, app):
	other, _ = await new_user(db_session, app, "roberto")
	me, auth = await new_user(db_session, app, "caio")
	db_session.add(Friendship(user_id=me.id, friend_id=other.id))
	await db_session.flush()
	body = (await client.get(f"/api/users/{other.id}", headers=auth)).json()
	assert body | {"created_at": ""} == {"id": other.id, "username": "roberto",
		"avatar_url": "/media/avatars/default.png", "created_at": "", "is_friend": True, "is_me": False}


async def test_friendship_is_one_way(client, db_session, app):
	# ele me adicionou, eu não: para mim, ele não é amigo
	other, _ = await new_user(db_session, app, "roberto")
	me, auth = await new_user(db_session, app, "caio")
	db_session.add(Friendship(user_id=other.id, friend_id=me.id))
	await db_session.flush()
	body = (await client.get(f"/api/users/{other.id}", headers=auth)).json()
	assert (body["is_friend"], body["is_me"]) == (False, False)


async def test_my_own_profile_has_no_email(client, db_session, app):
	me, auth = await new_user(db_session, app, "caio")
	body = (await client.get(f"/api/users/{me.id}", headers=auth)).json()
	assert (body["is_me"], body["is_friend"]) == (True, False)
	assert "email" not in body # o perfil é PublicUser, até o próprio


@pytest.mark.parametrize("user_id, status, code", [
	("999999999", 404, "user_not_found"),
	("99999999999999999999", 422, "validation_error"), # acima do BIGINT
	("0", 422, "validation_error"),
])
async def test_unknown_ids(client, db_session, app, user_id, status, code):
	_, auth = await new_user(db_session, app, "caio")
	response = await client.get(f"/api/users/{user_id}", headers=auth)
	assert (response.status_code, response.json()["error"]["code"]) == (status, code)
