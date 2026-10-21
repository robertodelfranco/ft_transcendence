# backend/tests/test_ratelimit.py
# RateLimit de auth.md §2.7: janela deslizante em memória, 429 rate_limited com Retry-After.
import asyncio

import pytest
from fastapi import Depends

import app.auth.service as service
from app.auth.deps import current_user
from app.auth.models import User
from app.core.errors import ApiError
from app.core.ratelimit import SWEEP_EVERY_S, Limit, RateLimit, RateLimitStore


class Clock:
	def __init__(self) -> None:
		self.now = 1000.0

	def __call__(self) -> float:
		return self.now


@pytest.fixture
def clock() -> Clock:
	return Clock()


@pytest.fixture
def store(clock) -> RateLimitStore:
	return RateLimitStore(clock)


# ---------- a janela ----------

def test_the_sixth_in_a_minute_is_refused_until_the_first_leaves_the_window(store, clock):
	for second in range(5):
		clock.now = 1000.0 + second * 10 # 1000, 1010, ..., 1040
		assert store.hit("login", "1.2.3.4", 5, 60) is None
	clock.now = 1045.0
	assert store.hit("login", "1.2.3.4", 5, 60) == 15.0 # o de 1000 sai da janela em 1060
	clock.now = 1060.0
	assert store.hit("login", "1.2.3.4", 5, 60) is None


def test_a_refused_request_does_not_count(store, clock):
	for _ in range(5):
		store.hit("login", "ip", 5, 60)
	for _ in range(100): # quem insiste não empurra a própria espera para frente
		store.hit("login", "ip", 5, 60)
	clock.now += 60
	assert store.hit("login", "ip", 5, 60) is None


def test_keys_and_limits_count_apart(store):
	for _ in range(5):
		store.hit("login", "a", 5, 60)
	assert store.hit("login", "a", 5, 60) is not None
	assert store.hit("login", "b", 5, 60) is None # outro IP
	assert store.hit("signup", "a", 5, 60) is None # outro limite


def test_refund_gives_back_one_slot(store):
	for _ in range(5):
		store.hit("login", "ip", 5, 60)
	store.refund("login", "ip")
	assert store.hit("login", "ip", 5, 60) is None
	assert store.hit("login", "ip", 5, 60) is not None
	store.refund("login", "nobody") # sem janela: nada a devolver, nada quebra


def test_idle_windows_leave_the_memory(store, clock):
	store.hit("login", "gone", 5, 60)
	clock.now += SWEEP_EVERY_S + 60
	store.hit("login", "here", 5, 60)
	assert [key for _, key in store._hits] == ["here"]


@pytest.mark.parametrize("times, seconds", [(0, 60), (5, 0)])
def test_a_limit_that_lets_nothing_through_is_a_bug(times, seconds):
	with pytest.raises(ValueError):
		Limit(times, seconds)


# ---------- nas rotas ----------

PASSWORD = "senha123"
SIGNUP = {"email": "limit@example.com", "username": "limit", "password": PASSWORD}
RIGHT = {"email": SIGNUP["email"], "password": PASSWORD}
WRONG = {"email": SIGNUP["email"], "password": "errada123"}


@pytest.fixture
def limited(app, clock, monkeypatch):
	"""O app com relógio próprio e um hash instantâneo: o que se testa é a contagem, não o Argon2."""
	app.state.rate_limits = RateLimitStore(clock)

	async def fast_hash(password: str) -> str:
		await asyncio.sleep(0) # suspende, como o pool do Argon2: as tentativas simultâneas se cruzam
		return f"fake:{password}"

	async def fast_verify(password: str, stored: str | None) -> tuple[bool, None]:
		await asyncio.sleep(0)
		return stored == f"fake:{password}", None

	monkeypatch.setattr(service, "hash_password", fast_hash)
	monkeypatch.setattr(service, "verify_password", fast_verify)
	return app


@pytest.fixture
async def account(client, db_session, limited):
	assert (await client.post("/api/auth/signup", json=SIGNUP)).status_code == 201
	limited.state.rate_limits = RateLimitStore(Clock()) # o signup acima não entra na conta dos testes


async def login(client, body: dict) -> int:
	return (await client.post("/api/auth/login", json=body)).status_code


@pytest.mark.anyio
async def test_the_sixth_wrong_password_in_a_minute_is_429_even_with_the_right_one(client, account):
	assert [await login(client, WRONG) for _ in range(5)] == [401] * 5
	response = await client.post("/api/auth/login", json=RIGHT)
	assert response.status_code == 429
	assert response.json()["error"]["code"] == "rate_limited"
	assert response.headers["retry-after"] == "60"


@pytest.mark.anyio
async def test_right_logins_do_not_count_as_failures(client, account):
	# a demonstração: várias abas logando da mesma máquina
	assert [await login(client, RIGHT) for _ in range(10)] == [200] * 10
	assert [await login(client, WRONG) for _ in range(5)] == [401] * 5


@pytest.mark.anyio
async def test_simultaneous_wrong_passwords_do_not_pass_together(client, limited, monkeypatch):
	# sem banco: as 20 requisições dividiriam a sessão do teste, e o que importa é a vaga reservada
	checked = 0

	async def slow_wrong_password(session, email, password):
		nonlocal checked
		checked += 1
		await asyncio.sleep(0.01) # o Argon2 demorando: as outras chegam enquanto este confere
		raise ApiError(401, "invalid_credentials")

	monkeypatch.setattr(service, "authenticate", slow_wrong_password)
	codes = await asyncio.gather(*(login(client, WRONG) for _ in range(20)))
	assert sorted(codes) == [401] * 5 + [429] * 15
	assert checked == 5 # só 5 chegaram a conferir a senha


@pytest.mark.anyio
async def test_every_attempt_counts_toward_the_ceiling(client, limited):
	# 422 não chega ao Argon2, mas o teto de 30 conta tudo
	assert {await login(client, {"email": "x"}) for _ in range(30)} == {422}
	assert await login(client, {"email": "x"}) == 429


@pytest.mark.anyio
async def test_signup_counts_only_valid_requests(client, db_session, limited):
	for _ in range(10): # senha fraca: 422, sem Argon2, sem contar
		assert (await client.post("/api/auth/signup", json={**SIGNUP, "password": "fraca"})).status_code == 422
	codes = [(await client.post("/api/auth/signup", json={**SIGNUP, "email": f"u{i}@example.com",
		"username": f"user{i}"})).status_code for i in range(6)]
	assert codes == [201] * 5 + [429]


@pytest.mark.anyio
async def test_the_user_key_counts_per_user(client, limited):
	users = iter([User(id=7), User(id=7), User(id=7), User(id=9)])
	limited.dependency_overrides[current_user] = lambda: next(users)

	@limited.post("/test/limited", dependencies=[Depends(RateLimit(2, 60, key="user"))])
	async def create() -> dict:
		return {}

	codes = [(await client.post("/test/limited")).status_code for _ in range(4)]
	assert codes == [200, 200, 429, 200] # o User 9 tem a própria contagem
