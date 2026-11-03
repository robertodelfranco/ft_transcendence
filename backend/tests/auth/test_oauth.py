# backend/tests/auth/test_oauth.py
# Login pela 42 (auth.md §2.8): a intra é um httpx.MockTransport, o banco é a sessão com rollback.
from urllib.parse import parse_qs, urlsplit

import httpx
import pytest
from sqlalchemy import select

from app.auth import oauth
from app.auth.models import OAuthAccount, RefreshToken, User


pytestmark = pytest.mark.anyio

ME = {"id": 4242, "email": "Rdel-Fra@student.42sp.org.br", "login": "rdel-fra"} # o /v2/me, resumido
EMAIL = "rdel-fra@student.42sp.org.br"


def intra(app, *, token_status: int = 200, me: dict = ME) -> None:
	"""Troca o cliente HTTP do callback por uma intra falsa, sem rede."""
	def handler(request: httpx.Request) -> httpx.Response:
		if request.url.path == "/oauth/token":
			return httpx.Response(token_status, json={"access_token": "intra-token"})
		assert request.headers["authorization"] == "Bearer intra-token"
		return httpx.Response(200, json=me)

	async def http():
		async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
			yield client
	app.dependency_overrides[oauth.get_oauth_http] = http


async def start(client, lang: str = "pt-BR") -> tuple[str, str]:
	"""O /login, como o botão da casca: devolve (state da URL da intra, cookie oauth_state)."""
	response = await client.get("/api/auth/oauth/42/login", params={"lang": lang})
	state = parse_qs(urlsplit(response.headers["location"]).query)["state"][0]
	return state, response.cookies[oauth.STATE_COOKIE]


async def callback(client, state: str | None, cookie: str | None, **params):
	# o jar do httpx não manda cookie Secure para http://test: o cookie vai no cabeçalho
	headers = {"Cookie": f"{oauth.STATE_COOKIE}={cookie}"} if cookie else {}
	query = {"code": "c0de", "state": state, **params}
	return await client.get("/api/auth/oauth/42/callback", headers=headers,
		params={k: v for k, v in query.items() if v is not None})


def logins(app, result: str) -> float:
	return app.state.metrics.registry.get_sample_value("auth_login_total", {"result": result}) or 0


async def account_owner(db_session) -> int | None:
	return await db_session.scalar(select(OAuthAccount.user_id)
		.where(OAuthAccount.provider == "42", OAuthAccount.provider_user_id == str(ME["id"])))


async def has_refresh(db_session, user: User) -> bool:
	return await db_session.scalar(select(RefreshToken.id).where(RefreshToken.user_id == user.id)
		.limit(1)) is not None


async def login_with_42(client, app) -> httpx.Response:
	intra(app)
	state, cookie = await start(client)
	return await callback(client, state, cookie)


# ---------- /login ----------

async def test_login_redirects_to_the_intra_with_the_state_of_the_cookie(client, settings):
	response = await client.get("/api/auth/oauth/42/login", params={"lang": "pt-BR"})
	assert response.status_code == 302
	url = urlsplit(response.headers["location"])
	assert (url.scheme, url.netloc, url.path) == ("https", "api.intra.42.fr", "/oauth/authorize")
	query = {key: values[0] for key, values in parse_qs(url.query).items()}
	assert query.pop("state")
	assert query == {"redirect_uri": "https://localhost/api/auth/oauth/42/callback",
		"response_type": "code", "scope": "public"} # client_id vazio no teste: parse_qs o descarta

	header = response.headers["set-cookie"]
	for flag in ("HttpOnly", "Max-Age=600", "Path=/api/auth/oauth", "SameSite=lax", "Secure"):
		assert flag in header
	state = parse_qs(url.query)["state"][0]
	cookie = response.cookies[oauth.STATE_COOKIE]
	assert oauth.check_state(cookie, state, "42", settings.jwt_secret.get_secret_value()) == "pt-BR"


@pytest.mark.parametrize("path", ["/api/auth/oauth/google/login", "/api/auth/oauth/github/callback"])
async def test_unknown_provider_is_404(client, path):
	response = await client.get(path)
	assert response.status_code == 404
	assert response.json()["error"]["code"] == "not_found"


@pytest.mark.parametrize("suggested, username", [
	("rdel-fra", "rdel_fra"),
	("Ab", "ab_"), # completa até 3
	("joão.silva", "jo_o_silva"),
	("x" * 25, "x" * 20),
])
def test_base_username(suggested, username):
	assert oauth.base_username(suggested) == username


# ---------- callback: falhas ----------

async def test_refusing_on_the_intra_is_cancelled_and_does_not_count(client, app, db_session):
	response = await callback(client, None, None, code=None, error="access_denied")
	assert (response.status_code, response.headers["location"]) == (302, "/login?error=oauth_cancelled")
	assert logins(app, "oauth_failed") == 0


@pytest.mark.parametrize("tamper", ["other_state", "no_cookie", "no_state", "no_code"])
async def test_a_broken_state_or_code_fails(client, app, db_session, tamper):
	intra(app)
	state, cookie = await start(client)
	if tamper == "other_state":
		state, _ = await start(client)
	response = await callback(client, None if tamper == "no_state" else state,
		None if tamper == "no_cookie" else cookie, code=None if tamper == "no_code" else "c0de")
	assert (response.status_code, response.headers["location"]) == (302, "/login?error=oauth_failed")
	assert logins(app, "oauth_failed") == 1
	assert await db_session.scalar(select(User).where(User.email == EMAIL)) is None


async def test_a_state_cookie_of_another_provider_fails(client, app, settings, db_session):
	intra(app)
	state, cookie = oauth.new_state("google", None, settings.jwt_secret.get_secret_value())
	response = await callback(client, state, cookie)
	assert response.headers["location"] == "/login?error=oauth_failed"


@pytest.mark.parametrize("trouble", [{"token_status": 500}, {"me": {"id": 4242, "login": "rdel-fra"}}])
async def test_an_intra_failure_fails(client, app, db_session, trouble):
	intra(app, **trouble) # a troca do code falha, ou o /v2/me vem sem e-mail
	state, cookie = await start(client)
	response = await callback(client, state, cookie)
	assert response.headers["location"] == "/login?error=oauth_failed"
	assert "refresh_token" not in response.headers.get("set-cookie", "")


# ---------- callback: quem entra ----------

async def test_a_new_user_is_created_and_logged_in(client, app, db_session):
	response = await login_with_42(client, app)
	assert (response.status_code, response.headers["location"]) == (302, "/")
	cookies = response.headers.get_list("set-cookie")
	assert any(c.startswith("refresh_token=") and "SameSite=strict" in c for c in cookies)
	assert any(c.startswith(f'{oauth.STATE_COOKIE}=""') and "Max-Age=0" in c for c in cookies)

	user = await db_session.scalar(select(User).where(User.email == EMAIL))
	assert (user.username, user.password_hash, user.preferred_language) == ("rdel_fra", None, "pt-BR")
	assert await account_owner(db_session) == user.id
	assert await has_refresh(db_session, user)
	assert logins(app, "oauth_success") == 1


async def test_a_taken_username_gets_a_suffix(client, app, db_session):
	db_session.add(User(email="outro@example.com", username="rdel_fra", password_hash=None))
	await db_session.flush()
	await login_with_42(client, app)
	assert await db_session.scalar(select(User.username).where(User.email == EMAIL)) == "rdel_fra2"


async def test_the_same_email_links_the_password_account(client, app, db_session):
	user = User(email=EMAIL, username="roberto", password_hash="$argon2id$x")
	db_session.add(user)
	await db_session.flush()
	await login_with_42(client, app)
	assert await db_session.scalar(select(User).where(User.username == "rdel_fra")) is None
	assert await account_owner(db_session) == user.id
	assert await has_refresh(db_session, user)


async def test_a_linked_account_logs_in_even_with_another_email(client, app, db_session):
	user = User(email="antigo@example.com", username="roberto", password_hash=None)
	db_session.add(user)
	await db_session.flush()
	db_session.add(OAuthAccount(user_id=user.id, provider="42", provider_user_id="4242"))
	await db_session.flush()
	await login_with_42(client, app)
	assert await db_session.scalar(select(User).where(User.email == EMAIL)) is None
	assert await has_refresh(db_session, user)
