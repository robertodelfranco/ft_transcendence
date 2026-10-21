# backend/tests/auth/test_refresh.py
# refresh com rotação e detecção de reuso, e logout (auth.md §2.2 e §2.6), contra o Postgres.
from datetime import datetime, timedelta, timezone

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select, update

from app.auth.models import RefreshToken
from app.auth.security import hash_refresh_token


pytestmark = pytest.mark.anyio

SIGNUP = {"email": "augusto@example.com", "username": "augusto", "password": "senha123"}


@pytest.fixture
async def browser(app, settings):
	"""A página do site: HTTPS, porque o cookie é Secure, e o Origin que o navegador manda num POST."""
	transport = ASGITransport(app=app, raise_app_exceptions=False)
	async with AsyncClient(transport=transport, base_url="https://test",
			headers={"Origin": f"https://{settings.public_host}"}) as c:
		yield c


@pytest.fixture
async def user(browser, db_session):
	await signup(browser)


async def signup(browser) -> str:
	response = await browser.post("/api/auth/signup", json=SIGNUP)
	assert response.status_code == 201
	return response.cookies["refresh_token"]


async def login(browser) -> str:
	response = await browser.post("/api/auth/login", json={k: SIGNUP[k] for k in ("email", "password")})
	assert response.status_code == 200
	return response.cookies["refresh_token"]


async def refresh(browser, token: str | None = None, **headers):
	# o cookie vai à mão: cada teste escolhe qual token "o navegador" ainda tem
	if token is not None:
		headers["Cookie"] = f"refresh_token={token}"
	return await browser.post("/api/auth/refresh", headers=headers)


async def row(db_session, token: str) -> RefreshToken:
	return await db_session.scalar(select(RefreshToken)
		.where(RefreshToken.token_hash == hash_refresh_token(token))
		.execution_options(populate_existing=True))


async def family(db_session, token: str) -> list[RefreshToken]:
	family_id = (await row(db_session, token)).family_id
	return list(await db_session.scalars(select(RefreshToken)
		.where(RefreshToken.family_id == family_id).order_by(RefreshToken.id)
		.execution_options(populate_existing=True)))


async def backdate_rotation(db_session, token: str, seconds: float) -> None:
	await db_session.execute(update(RefreshToken)
		.where(RefreshToken.token_hash == hash_refresh_token(token))
		.values(rotated_at=datetime.now(timezone.utc) - timedelta(seconds=seconds)))


def assert_invalid_refresh(response) -> None:
	assert response.status_code == 401
	assert response.json()["error"]["code"] == "invalid_refresh"
	header = response.headers["set-cookie"]
	assert header.startswith('refresh_token=""') or header.startswith("refresh_token=;")
	for flag in ("Max-Age=0", "Path=/api/auth", "Secure", "HttpOnly"):
		assert flag in header


# ---------- refresh ----------

async def test_refresh_without_a_cookie_is_not_an_error(browser, db_session):
	response = await refresh(browser)
	assert response.status_code == 200
	assert response.json() == {"authenticated": False}
	assert "set-cookie" not in response.headers


async def test_refresh_rotates_inside_the_same_family(browser, db_session):
	old = await signup(browser)
	response = await refresh(browser, old)
	assert response.status_code == 200
	body = response.json()
	assert (body["authenticated"], body["user"]["username"]) == (True, "augusto")
	assert response.headers["cache-control"] == "no-store"
	new = response.cookies["refresh_token"]
	assert new != old

	first, second = await family(db_session, old)
	assert first.token_hash == hash_refresh_token(old) and first.rotated_at is not None
	assert first.replaced_by == second.id and second.token_hash == hash_refresh_token(new)
	assert second.rotated_at is None
	me = await browser.get("/api/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"})
	assert me.status_code == 200


async def test_the_old_cookie_inside_the_grace_window_gets_an_access_and_no_cookie(browser, db_session):
	# duas abas recarregam juntas com o mesmo cookie (decisão 5)
	old = await signup(browser)
	assert (await refresh(browser, old)).status_code == 200
	response = await refresh(browser, old)
	assert response.status_code == 200
	assert response.json()["authenticated"] is True
	assert "set-cookie" not in response.headers
	assert len(await family(db_session, old)) == 2 # nenhum sucessor a mais


async def test_reuse_after_the_grace_window_revokes_the_whole_family(browser, db_session, user):
	other_browser = await login(browser) # outra família do mesmo User
	old = await login(browser)
	new = (await refresh(browser, old)).cookies["refresh_token"]
	await backdate_rotation(db_session, old, 10)

	assert_invalid_refresh(await refresh(browser, old))
	assert all(token.revoked_at is not None for token in await family(db_session, old))
	assert_invalid_refresh(await refresh(browser, new)) # quem roubou o cookie também perde
	assert (await refresh(browser, other_browser)).status_code == 200 # a outra família continua


async def test_inside_the_window_with_a_logged_out_successor_is_reuse(browser, db_session, user):
	old = await login(browser)
	new = (await refresh(browser, old)).cookies["refresh_token"]
	assert (await browser.post("/api/auth/logout", headers={"Cookie": f"refresh_token={new}"})).status_code == 204

	assert_invalid_refresh(await refresh(browser, old))
	assert all(token.revoked_at is not None for token in await family(db_session, old))


@pytest.mark.parametrize("state", ["unknown", "expired", "revoked"])
async def test_refresh_with_a_dead_token_is_401_and_changes_nothing(browser, db_session, user, state):
	token = await login(browser)
	values = {"expired": {"expires_at": datetime.now(timezone.utc) - timedelta(seconds=1)},
		"revoked": {"revoked_at": datetime.now(timezone.utc)}}.get(state)
	if values:
		await db_session.execute(update(RefreshToken)
			.where(RefreshToken.token_hash == hash_refresh_token(token)).values(**values))
	before = [(t.id, t.rotated_at, t.revoked_at) for t in await family(db_session, token)]

	assert_invalid_refresh(await refresh(browser, "nao-existe" if state == "unknown" else token))
	assert [(t.id, t.rotated_at, t.revoked_at) for t in await family(db_session, token)] == before


@pytest.mark.parametrize("route", ["/api/auth/refresh", "/api/auth/logout"])
@pytest.mark.parametrize("origin", [None, "http://localhost", "https://evil.example", "null"])
async def test_a_foreign_origin_is_403(browser, route, origin):
	# sem banco: o 403 sai antes de a rota abrir a sessão
	headers = {"Origin": origin} if origin else {}
	if origin is None:
		del browser.headers["Origin"]
	response = await browser.post(route, headers=headers)
	assert response.status_code == 403
	assert response.json()["error"]["code"] == "forbidden"


async def test_refresh_has_a_limit_of_30_per_minute(browser):
	for _ in range(30):
		assert (await refresh(browser)).status_code == 200
	response = await refresh(browser)
	assert response.status_code == 429
	assert "retry-after" in response.headers


# ---------- logout ----------

async def test_logout_revokes_only_its_own_token(browser, db_session):
	mine = await signup(browser)
	other_browser = await login(browser)
	response = await browser.post("/api/auth/logout", headers={"Cookie": f"refresh_token={mine}"})
	assert response.status_code == 204
	assert "Max-Age=0" in response.headers["set-cookie"]

	assert (await row(db_session, mine)).revoked_at is not None
	assert (await row(db_session, other_browser)).revoked_at is None
	assert_invalid_refresh(await refresh(browser, mine))
	assert (await refresh(browser, other_browser)).status_code == 200


@pytest.mark.parametrize("cookie", [None, "nao-existe"])
async def test_logout_is_always_204(browser, db_session, cookie):
	headers = {"Cookie": f"refresh_token={cookie}"} if cookie else {}
	for _ in range(2): # sair duas vezes não é erro
		response = await browser.post("/api/auth/logout", headers=headers)
		assert response.status_code == 204
		assert "Max-Age=0" in response.headers["set-cookie"]
