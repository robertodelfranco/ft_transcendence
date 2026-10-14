# backend/tests/auth/test_security.py
# Senha, access e refresh (auth.md §2.6), sem banco e sem HTTP.
import asyncio
import base64
import json
from datetime import datetime, timedelta, timezone

import jwt
import pytest

from app.auth.security import (InvalidToken, create_access_token, decode_access_token,
	hash_password, hash_refresh_token, new_refresh_token, verify_password)
from app.core.config import Settings


SECRET = "s" * 32
OTHER_SECRET = "o" * 32


# ---------- senha ----------

@pytest.mark.anyio
async def test_password_hash_is_argon2id_with_salt():
	first, second = await hash_password("senha123"), await hash_password("senha123")
	assert first.startswith("$argon2id$")
	assert first != second # salt aleatório: a mesma senha nunca dá o mesmo hash


@pytest.mark.anyio
async def test_verify_accepts_only_the_right_password():
	stored = await hash_password("senha123")
	assert (await verify_password("senha123", stored))[0] is True
	assert (await verify_password("senha124", stored))[0] is False


@pytest.mark.anyio
async def test_hashing_does_not_block_the_event_loop():
	# o Argon2 leva centenas de ms; se rodasse no loop, o tick das Rooms (33 ms) pararia junto
	beats = 0

	async def heartbeat() -> None:
		nonlocal beats
		while True:
			await asyncio.sleep(0.005)
			beats += 1

	task = asyncio.create_task(heartbeat())
	await hash_password("senha123")
	task.cancel()
	assert beats >= 5


@pytest.mark.anyio
async def test_verify_without_a_stored_hash_is_always_false():
	# conta só de OAuth, ou e-mail inexistente: confere contra o hash falso e recusa
	assert await verify_password("qualquer1", None) == (False, None)


# ---------- access token ----------

def test_access_token_round_trip():
	assert decode_access_token(create_access_token(7, SECRET, 900), SECRET) == 7


def test_access_token_has_the_contract_claims():
	claims = jwt.decode(create_access_token(7, SECRET, 900), SECRET, algorithms=["HS256"])
	assert claims.keys() == {"sub", "exp", "iat", "jti", "typ"}
	assert (claims["sub"], claims["typ"], claims["exp"] - claims["iat"]) == ("7", "access", 900)


def test_every_access_token_has_its_own_jti():
	assert create_access_token(7, SECRET, 900) != create_access_token(7, SECRET, 900)


def forged(claims: dict, secret: str = SECRET, algorithm: str = "HS256") -> str:
	now = datetime.now(timezone.utc)
	base = {"sub": "7", "iat": now, "exp": now + timedelta(minutes=15), "jti": "x", "typ": "access"}
	return jwt.encode({**base, **claims}, secret, algorithm=algorithm)


def unsigned(claims: dict) -> str:
	# alg "none": o ataque clássico de quem tira a assinatura
	def part(data: dict) -> str:
		return base64.urlsafe_b64encode(json.dumps(data).encode()).rstrip(b"=").decode()
	return f"{part({'alg': 'none', 'typ': 'JWT'})}.{part(claims)}."


@pytest.mark.parametrize("token", [
	forged({}, secret=OTHER_SECRET), # outra assinatura
	forged({"exp": datetime.now(timezone.utc) - timedelta(seconds=1)}), # vencido
	forged({"typ": "refresh"}), # outro tipo
	forged({"sub": "abc"}),
	forged({"sub": "٣"}), # dígito que não é ASCII
	forged({}, algorithm="HS512"), # algoritmo trocado
	unsigned({"sub": "7", "exp": 9999999999, "iat": 0, "jti": "x", "typ": "access"}),
	"not-a-jwt",
	"",
])
def test_invalid_access_tokens_are_refused(token):
	with pytest.raises(InvalidToken):
		decode_access_token(token, SECRET)


@pytest.mark.parametrize("missing", ["sub", "exp", "iat", "jti", "typ"])
def test_access_token_without_a_required_claim_is_refused(missing):
	now = datetime.now(timezone.utc)
	claims = {"sub": "7", "iat": now, "exp": now + timedelta(minutes=15), "jti": "x", "typ": "access"}
	del claims[missing]
	with pytest.raises(InvalidToken):
		decode_access_token(jwt.encode(claims, SECRET, algorithm="HS256"), SECRET)


# ---------- refresh token ----------

def test_refresh_token_is_random_and_only_its_hash_is_kept():
	(token_a, hash_a), (token_b, _) = new_refresh_token(), new_refresh_token()
	assert token_a != token_b
	assert len(token_a) == 64 # 48 bytes em base64url
	assert hash_a == hash_refresh_token(token_a) and len(hash_a) == 64
	assert token_a not in hash_a


# ---------- segredo ----------

def test_production_refuses_to_start_without_a_secret():
	with pytest.raises(ValueError, match="JWT_SECRET"):
		Settings(app_env="production", jwt_secret="")


def test_a_short_secret_is_refused_everywhere():
	with pytest.raises(ValueError, match="32 bytes"):
		Settings(app_env="development", jwt_secret="curto")


def test_without_a_secret_development_uses_one_per_process():
	first, second = Settings(app_env="test"), Settings(app_env="development")
	assert first.jwt_secret.get_secret_value() == second.jwt_secret.get_secret_value()
	assert len(first.jwt_secret.get_secret_value()) >= 32
	assert "*" in repr(first.jwt_secret) # SecretStr: o valor não vai para log
