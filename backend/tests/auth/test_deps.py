# backend/tests/auth/test_deps.py
# OptionalUser e authenticate_ws_token (auth.md §2.7) contra o Postgres, com a sessão do teste.
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import jwt
import pytest

from app.auth.deps import OptionalUser
from app.auth.models import User
from app.auth.security import InvalidToken, create_access_token
from app.auth.service import authenticate_ws_token


pytestmark = pytest.mark.anyio

OTHER_SECRET = "o" * 32
LONG_AGO = datetime.now(timezone.utc) - timedelta(days=1)


@pytest.fixture
async def user(db_session) -> User:
	user = User(email="viewer@example.com", username="viewer", password_hash=None)
	db_session.add(user)
	await db_session.flush()
	return user


@pytest.fixture
def secret(app) -> str:
	return app.state.settings.jwt_secret.get_secret_value()


@pytest.fixture
def probe(app):
	# uma rota pública mínima, como o perfil público ou as estatísticas
	@app.get("/test/viewer")
	async def viewer(user: OptionalUser) -> dict:
		return {"user_id": user.id if user else None}


def bearer(token: str) -> dict[str, str]:
	return {"Authorization": f"Bearer {token}"}


# ---------- OptionalUser ----------

async def test_optional_user_without_a_token_is_a_visitor(client, db_session, probe):
	response = await client.get("/test/viewer")
	assert (response.status_code, response.json()) == (200, {"user_id": None})


async def test_optional_user_with_a_valid_token(client, user, secret, probe):
	response = await client.get("/test/viewer", headers=bearer(create_access_token(user.id, secret, 900)))
	assert response.json() == {"user_id": user.id}


@pytest.mark.parametrize("token", [
	"not-a-jwt",
	create_access_token(1, OTHER_SECRET, 900),
])
async def test_optional_user_with_an_invalid_token_is_still_401(client, db_session, probe, token):
	# o visitante não tem cabeçalho; quem manda token vencido precisa saber, para renovar
	response = await client.get("/test/viewer", headers=bearer(token))
	assert response.status_code == 401
	assert response.json()["error"]["code"] == "unauthorized"
	assert response.headers["www-authenticate"] == "Bearer"


async def test_optional_user_of_a_deleted_user_is_401(client, db_session, secret, probe):
	response = await client.get("/test/viewer", headers=bearer(create_access_token(999_999, secret, 900)))
	assert response.status_code == 401


# ---------- authenticate_ws_token ----------

@pytest.fixture
def released(app, db_session):
	"""As sessões que authenticate_ws_token abriu e já soltou, na ordem."""
	return []


@pytest.fixture
def ws(app, db_session, released):
	"""authenticate_ws_token como o /ws/game chama, só que com a sessão do teste."""
	connection = SimpleNamespace(app=app) # a função só lê connection.app

	@asynccontextmanager
	async def sessions():
		yield db_session
		released.append(db_session) # só chega aqui se o `async with` de quem chamou terminou

	async def authenticate(token: str) -> User:
		return await authenticate_ws_token(connection, token, sessions=sessions)
	return authenticate


async def test_ws_token_gives_the_user(ws, user, secret):
	assert await ws(create_access_token(user.id, secret, 900)) is user


async def test_ws_token_releases_the_session_before_returning(ws, user, secret, released):
	# o socket vive a partida inteira: a conexão do pool não pode ficar presa a ele
	await ws(create_access_token(user.id, secret, 900))
	assert len(released) == 1


@pytest.mark.parametrize("make_token", [
	lambda user_id, secret: "not-a-jwt",
	lambda user_id, secret: create_access_token(user_id, OTHER_SECRET, 900),
	lambda user_id, secret: create_access_token(user_id, secret, 900, now=LONG_AGO), # vencido
	lambda user_id, secret: create_access_token(999_999, secret, 900), # User apagado
	lambda user_id, secret: jwt.encode({"sub": str(user_id), "typ": "refresh", "jti": "x", # outro tipo
		"iat": LONG_AGO, "exp": LONG_AGO + timedelta(days=9999)}, secret, algorithm="HS256"),
])
async def test_ws_token_refusals_raise_invalid_token(ws, user, secret, make_token):
	with pytest.raises(InvalidToken):
		await ws(make_token(user.id, secret))
