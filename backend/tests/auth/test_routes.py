# backend/tests/auth/test_routes.py
# signup, login e me (auth.md §2.2) contra o Postgres, com a sessão que sofre rollback no fim.
import json
import re
from pathlib import Path

import pytest
from sqlalchemy import select

from app.auth.models import OAuthAccount, RefreshToken, User
from app.auth.schemas import SignupIn
from app.auth.service import create_user
from app.core.errors import ApiError
from app.auth.security import create_access_token, hash_refresh_token


pytestmark = pytest.mark.anyio

CONTRACT = Path(__file__).resolve().parents[3] / "docs" / "contracts" / "auth.md"
SIGNUP = {"email": "augusto@example.com", "username": "augusto", "password": "senha123",
	"preferred_language": "pt-BR"}
LOGIN = {"email": SIGNUP["email"], "password": SIGNUP["password"]}


def contract_auth_response() -> dict:
	# o primeiro JSON depois do "Set-Cookie" do exemplo da §3
	text = CONTRACT.read_text(encoding="utf-8")
	return json.loads(re.search(r'```json\n(\{\n  "authenticated": true.*?)```', text, re.S).group(1))


async def signup(client, **changes):
	return await client.post("/api/auth/signup", json={**SIGNUP, **changes})


def bearer(token: str) -> dict[str, str]:
	return {"Authorization": f"Bearer {token}"}


# ---------- signup ----------

async def test_signup_logs_in_with_the_contract_shape(client, db_session):
	response = await signup(client)
	assert response.status_code == 201
	body = response.json()
	example = contract_auth_response()
	assert body.keys() == example.keys()
	assert body["user"].keys() == example["user"].keys()
	assert body["user"] | {"id": 0, "created_at": ""} == {"id": 0, "created_at": "",
		"username": "augusto", "avatar_url": "/media/avatars/default.png",
		"email": "augusto@example.com", "preferred_language": "pt-BR",
		"has_password": True, "providers": []}
	assert (body["authenticated"], body["token_type"], body["expires_in"]) == (True, "bearer", 900)
	assert body["user"]["created_at"].endswith("Z")


async def test_signup_sets_the_refresh_cookie_and_keeps_only_its_hash(client, db_session):
	response = await signup(client, email="cookie@example.com", username="cookie")
	header = response.headers["set-cookie"]
	assert re.match(r"refresh_token=[\w-]{64}; ", header)
	for flag in ("HttpOnly", "Max-Age=604800", "Path=/api/auth", "SameSite=strict", "Secure"):
		assert flag in header
	assert response.headers["cache-control"] == "no-store"

	token = response.cookies["refresh_token"]
	row = await db_session.scalar(select(RefreshToken))
	assert row.token_hash == hash_refresh_token(token)
	assert token not in row.token_hash
	user = await db_session.scalar(select(User).where(User.username == "cookie"))
	assert user.password_hash.startswith("$argon2id$") # nunca a senha em claro


async def test_signup_normalizes_email_and_username(client, db_session):
	body = (await signup(client, email=" Augusto@Example.COM ", username="AUGUSTO")).json()
	assert (body["user"]["email"], body["user"]["username"]) == ("augusto@example.com", "augusto")


@pytest.mark.parametrize("changes, code", [
	({"email": "AUGUSTO@example.com", "username": "outro"}, "email_taken"), # maiúscula é o mesmo e-mail
	({"email": "outro@example.com", "username": "Augusto"}, "username_taken"),
])
async def test_signup_conflicts(client, db_session, changes, code):
	await signup(client)
	response = await signup(client, **changes)
	assert response.status_code == 409
	assert response.json()["error"]["code"] == code
	assert "set-cookie" not in response.headers


async def test_a_conflict_undoes_only_the_new_user(db_session):
	# o OAuth (F6.8) pode chamar create_user no meio de uma transação: o que veio antes fica
	await create_user(db_session, SignupIn.model_validate(SIGNUP))
	earlier = User(email="antes@example.com", username="antes")
	db_session.add(earlier)
	await db_session.flush()
	with pytest.raises(ApiError, match="email taken"):
		await create_user(db_session, SignupIn.model_validate({**SIGNUP, "username": "outro"}))
	assert await db_session.scalar(select(User).where(User.username == "antes")) is earlier


async def test_signup_validation_uses_field_codes(client, db_session):
	response = await signup(client, password="fraquinha")
	assert response.status_code == 422
	assert response.json()["error"]["fields"] == {"password": "weak_password"}


# ---------- login ----------

async def test_login_returns_tokens_and_opens_a_new_family(client, db_session):
	await signup(client)
	response = await client.post("/api/auth/login", json={**LOGIN, "email": " AUGUSTO@example.com"},
		headers={"User-Agent": "x" * 300})
	assert response.status_code == 200
	assert response.json()["user"]["username"] == "augusto"
	rows = (await db_session.scalars(select(RefreshToken))).all()
	assert len({row.family_id for row in rows}) == 2 # signup e login: uma família cada
	assert max(len(row.user_agent or "") for row in rows) == 255


async def oauth_only_user(db_session) -> None:
	user = User(email="oauth@example.com", username="oauth_only", password_hash=None)
	db_session.add(user)
	await db_session.flush()
	db_session.add(OAuthAccount(user_id=user.id, provider="google", provider_user_id="g-1"))
	await db_session.flush()


@pytest.mark.parametrize("credentials", [
	{"email": "ninguem@example.com", "password": "senha123"}, # e-mail inexistente
	{"email": SIGNUP["email"], "password": "errada123"}, # senha errada
	{"email": "oauth@example.com", "password": "senha123"}, # conta só de OAuth
])
async def test_every_login_failure_looks_the_same(client, db_session, credentials):
	await signup(client)
	await oauth_only_user(db_session)
	response = await client.post("/api/auth/login", json=credentials)
	assert response.status_code == 401
	error = response.json()["error"]
	assert (error["code"], error["message"]) == ("invalid_credentials", "invalid e-mail or password")
	assert "set-cookie" not in response.headers


async def test_login_does_not_check_the_signup_password_rules(client, db_session):
	# senha fraca no login é só uma senha errada, nunca um 422 que revela a regra
	response = await client.post("/api/auth/login", json={**LOGIN, "password": "abc"})
	assert response.status_code == 401


# ---------- me ----------

async def test_me_returns_the_private_user(client, db_session):
	body = (await signup(client)).json()
	response = await client.get("/api/auth/me", headers=bearer(body["access_token"]))
	assert response.status_code == 200
	assert response.json() == body["user"]


async def test_me_lists_providers_in_alphabetical_order(client, db_session, app):
	await oauth_only_user(db_session)
	user = await db_session.scalar(select(User).where(User.username == "oauth_only"))
	db_session.add(OAuthAccount(user_id=user.id, provider="42", provider_user_id="4242"))
	await db_session.flush()
	secret = app.state.settings.jwt_secret.get_secret_value()
	body = (await client.get("/api/auth/me", headers=bearer(create_access_token(user.id, secret, 900)))).json()
	assert (body["providers"], body["has_password"]) == (["42", "google"], False)


@pytest.mark.parametrize("headers", [
	{}, # sem cabeçalho
	{"Authorization": "Basic dXNlcjpwYXNz"}, # outro esquema
	bearer("not-a-jwt"),
	bearer(create_access_token(1, "o" * 32, 900)), # outro segredo
])
async def test_me_without_a_valid_token_is_401(client, db_session, headers):
	response = await client.get("/api/auth/me", headers=headers)
	assert response.status_code == 401
	assert response.json()["error"]["code"] == "unauthorized"
	assert response.headers["www-authenticate"] == "Bearer"


async def test_me_of_a_deleted_user_is_401(client, db_session, app):
	secret = app.state.settings.jwt_secret.get_secret_value()
	response = await client.get("/api/auth/me", headers=bearer(create_access_token(999_999, secret, 900)))
	assert response.status_code == 401
