"""Senha, access token e refresh token (auth.md §2.6): só criptografia, sem banco e sem HTTP.

O Argon2 custa dezenas de milissegundos de CPU, mais que um Tick inteiro (33 ms). Por isso ele
roda num pool de threads próprio: o event loop, que também roda as Rooms, nunca espera um hash.
"""
import asyncio
import hashlib
import secrets
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

import jwt
from pwdlib import PasswordHash
from pwdlib.hashers.argon2 import Argon2Hasher


ALGORITHM = "HS256"
ACCESS_TYPE = "access"
REQUIRED_CLAIMS = ["sub", "exp", "iat", "jti", "typ"]
REFRESH_TOKEN_BYTES = 48
# cada hash usa 64 MiB e 4 lanes de CPU: 2 de uma vez seguram a memória numa enxurrada de logins
# e deixam núcleo livre para o tick das Rooms
HASH_WORKERS = 2

_password_hash = PasswordHash((Argon2Hasher(),)) # Argon2id com os parâmetros padrão do argon2-cffi
_hash_pool = ThreadPoolExecutor(max_workers=HASH_WORKERS, thread_name_prefix="argon2")
# hash de uma senha que ninguém conhece: conferir contra ele custa o mesmo que contra um de verdade
_DUMMY_HASH = _password_hash.hash(secrets.token_urlsafe(16))


class InvalidToken(Exception):
	"""Access token ausente do formato, vencido, com outra assinatura ou de outro tipo."""


# ---------- senha ----------

async def hash_password(password: str) -> str:
	return await asyncio.get_running_loop().run_in_executor(_hash_pool, _password_hash.hash, password)


async def verify_password(password: str, stored_hash: str | None) -> tuple[bool, str | None]:
	"""(confere, hash novo para gravar). Sem hash guardado, confere contra o falso e devolve False.

	O hash novo vem quando os parâmetros do Argon2 mudaram desde o cadastro: o login atualiza a
	senha sem precisar de migração.
	"""
	valid, new_hash = await asyncio.get_running_loop().run_in_executor(
		_hash_pool, _password_hash.verify_and_update, password, stored_hash or _DUMMY_HASH)
	return valid and stored_hash is not None, new_hash


# ---------- access token ----------

def create_access_token(user_id: int, secret: str, ttl_s: int, *, now: datetime | None = None) -> str:
	issued_at = now or datetime.now(timezone.utc)
	claims = {
		"sub": str(user_id), # RFC 7519: sub é texto
		"iat": issued_at,
		"exp": issued_at + timedelta(seconds=ttl_s),
		"jti": uuid.uuid4().hex,
		"typ": ACCESS_TYPE,
	}
	return jwt.encode(claims, secret, algorithm=ALGORITHM)


def decode_access_token(token: str, secret: str) -> int:
	"""Devolve o user_id. O algoritmo é fixo: um token com alg "none" ou trocado é recusado."""
	try:
		claims = jwt.decode(token, secret, algorithms=[ALGORITHM], options={"require": REQUIRED_CLAIMS})
	except jwt.PyJWTError as error:
		raise InvalidToken(str(error)) from None
	subject = claims["sub"]
	if claims["typ"] != ACCESS_TYPE or not isinstance(subject, str) or not _is_ascii_digits(subject):
		raise InvalidToken("not an access token")
	return int(subject)


def _is_ascii_digits(text: str) -> bool:
	# str.isdigit sozinho aceita "٣" e "²"
	return text.isascii() and text.isdigit()


# ---------- refresh token ----------

def new_refresh_token() -> tuple[str, str]:
	"""(token para o cookie, sha256 para o banco). O token em claro nunca é gravado."""
	token = secrets.token_urlsafe(REFRESH_TOKEN_BYTES)
	return token, hash_refresh_token(token)


def hash_refresh_token(token: str) -> str:
	# sem salt de propósito: 384 bits aleatórios não têm dicionário, e a busca precisa ser exata
	return hashlib.sha256(token.encode()).hexdigest()
