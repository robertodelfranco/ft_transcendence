"""Regras de cadastro, login e emissão de tokens (auth.md §2.2, §2.6 e §2.7).

Nenhuma função aqui faz commit: quem escreve é a rota, numa transação só (User e refresh juntos).
"""
import uuid
from collections.abc import Callable
from datetime import datetime, timedelta, timezone

from fastapi import Request, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import HTTPConnection

from app.auth.models import OAuthAccount, Provider, RefreshToken, User
from app.auth.schemas import DEFAULT_AVATAR_URL, AuthResponse, PrivateUser, SignupIn
from app.auth.security import (InvalidToken, create_access_token, decode_access_token, hash_password,
	new_refresh_token, verify_password)
from app.core.config import get_app_settings
from app.core.errors import ApiError
from app.db.session import SessionLocal


REFRESH_COOKIE = "refresh_token"
REFRESH_COOKIE_PATH = "/api/auth" # o cookie só viaja para as rotas de auth
MAX_USER_AGENT = 255
# a constraint UNIQUE que o Postgres acusou → o code da API
UNIQUE_TO_CODE = {"uq_users_email": "email_taken", "uq_users_username": "username_taken"}


# ---------- cadastro e login ----------

async def create_user(session: AsyncSession, data: SignupIn) -> User:
	"""INSERT direto: a UNIQUE do banco decide, sem SELECT antes e sem corrida entre dois cadastros."""
	user = User(email=data.email, username=data.username,
		password_hash=await hash_password(data.password),
		preferred_language=data.preferred_language)
	try:
		# savepoint: o conflito desfaz só este INSERT, não o que quem chamou já fez na transação
		async with session.begin_nested():
			session.add(user)
	except IntegrityError as error:
		code = UNIQUE_TO_CODE.get(_constraint_name(error))
		if code is None:
			raise
		raise ApiError(409, code, code.replace("_", " ")) from None
	return user


async def authenticate(session: AsyncSession, email: str, password: str) -> User:
	"""E-mail inexistente, senha errada e conta só de OAuth: a mesma resposta, no mesmo tempo."""
	user = await session.scalar(select(User).where(User.email == email))
	valid, new_hash = await verify_password(password, user.password_hash if user else None)
	if not valid:
		raise ApiError(401, "invalid_credentials", "invalid e-mail or password")
	if new_hash is not None:
		user.password_hash = new_hash # parâmetros do Argon2 mudaram: regrava no commit da rota
	return user


def _constraint_name(error: IntegrityError) -> str | None:
	# o asyncpg põe o nome na exceção original, que o SQLAlchemy guarda como causa
	return getattr(error.orig.__cause__, "constraint_name", None)


# ---------- quem chama ----------

async def user_from_access_token(session: AsyncSession, token: str, secret: str) -> User:
	"""O dono de um access token válido. A regra é a mesma no HTTP (deps.py) e nos WebSockets."""
	user = await session.get(User, decode_access_token(token, secret))
	if user is None: # conta apagada depois de o token sair
		raise InvalidToken("user no longer exists")
	return user


async def authenticate_ws_token(connection: HTTPConnection, token: str, *,
		sessions: Callable[[], AsyncSession] = SessionLocal) -> User:
	"""O `join` dos WebSockets; InvalidToken vira `4401` em quem chama (auth.md §2.7).

	A sessão é própria e fecha antes de voltar: o socket vive a partida inteira, e segurar uma
	conexão do pool esse tempo todo esgotaria o pool com poucas Rooms. O User volta desligado da
	sessão, com as colunas carregadas; relacionamento ele não carrega.
	"""
	secret = get_app_settings(connection).jwt_secret.get_secret_value()
	async with sessions() as session:
		return await user_from_access_token(session, token, secret)


# ---------- tokens ----------

async def issue_tokens(session: AsyncSession, user: User, request: Request,
		response: Response, *, providers: list[Provider] | None = None) -> AuthResponse:
	"""Abre uma família de refresh nova, grava o cookie e devolve o corpo do login.

	É o que signup, login e o callback do OAuth chamam; o commit fica com eles. Quem já sabe os
	providers (o signup sabe que não há nenhum) passa a lista e poupa uma consulta.
	"""
	settings = get_app_settings(request)
	token, token_hash = new_refresh_token()
	user_agent = request.headers.get("user-agent")
	session.add(RefreshToken(user_id=user.id, token_hash=token_hash, family_id=uuid.uuid4(),
		expires_at=datetime.now(timezone.utc) + timedelta(seconds=settings.refresh_token_ttl_s),
		user_agent=user_agent[:MAX_USER_AGENT] if user_agent else None))
	await session.flush()

	response.set_cookie(REFRESH_COOKIE, token, max_age=settings.refresh_token_ttl_s,
		path=REFRESH_COOKIE_PATH, secure=True, httponly=True, samesite="strict")
	# resposta com token não fica em cache de navegador nem de proxy (RFC 6749 §5.1)
	response.headers["Cache-Control"] = "no-store"
	access = create_access_token(user.id, settings.jwt_secret.get_secret_value(),
		settings.access_token_ttl_s)
	return AuthResponse(access_token=access, expires_in=settings.access_token_ttl_s,
		user=await private_user(session, user, providers))


# ---------- serialização (§2.3) ----------

async def private_user(session: AsyncSession, user: User,
		providers: list[Provider] | None = None) -> PrivateUser:
	if providers is None:
		providers = list(await session.scalars(
			select(OAuthAccount.provider).where(OAuthAccount.user_id == user.id)))
	return PrivateUser(id=user.id, username=user.username,
		avatar_url=user.avatar_url or DEFAULT_AVATAR_URL, created_at=user.created_at,
		email=user.email, preferred_language=user.preferred_language,
		has_password=user.password_hash is not None, providers=sorted(providers))
