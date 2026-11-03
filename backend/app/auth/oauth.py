"""Login por OAuth 2.0 Authorization Code (auth.md §2.8): o fluxo é comum, cada provedor é uma linha.

O token do provedor só serve para ler o User no callback e é descartado. O que sai daqui é o User;
quem chama emite os nossos tokens com issue_tokens, igual ao login por senha.
"""
import re
import secrets
from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Annotated, Any
from urllib.parse import urlencode

import httpx
import jwt
from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import DEFAULT_LANGUAGE, LANGUAGES, Language, OAuthAccount, Provider, User
from app.auth.security import ALGORITHM
from app.auth.service import _constraint_name
from app.core.config import Settings


STATE_COOKIE = "oauth_state"
STATE_COOKIE_PATH = "/api/auth/oauth" # só viaja para o login e o callback
STATE_TTL_S = 600 # tempo de sobra para o User decidir na tela do provedor
STATE_TYPE = "oauth_state" # um access token, assinado com o mesmo segredo, não passa por state
HTTP_TIMEOUT_S = 5.0
USERNAME_MIN, USERNAME_MAX = 3, 20 # USERNAME_PATTERN
MAX_USERNAME_TRIES = 100


class OAuthFailed(Exception):
	"""Tudo que vira 302 /login?error=oauth_failed. A mensagem vai para o log: nunca code nem state."""


@dataclass(frozen=True)
class Profile:
	provider_user_id: str
	email: str # já em minúsculas, como a coluna exige
	suggested_username: str # ainda sem normalizar


@dataclass(frozen=True)
class Adapter:
	authorize_url: str
	token_url: str
	userinfo_url: str
	scope: str
	credentials: Callable[[Settings], tuple[str, str]] # (client_id, client_secret)
	profile: Callable[[dict[str, Any]], Profile] # a resposta do userinfo


def _profile_42(me: dict[str, Any]) -> Profile:
	# /v2/me: id inteiro, login que pode ter hífen. O e-mail é da escola: confiável (decisão 20)
	return Profile(str(me["id"]), me["email"].lower(), me["login"])


# a 42 ignora o PKCE ("Em aberto" 11): fica só com state. O Google (#164) entra como outra linha,
# com PKCE e email_verified
ADAPTERS: dict[Provider, Adapter] = {
	"42": Adapter(
		authorize_url="https://api.intra.42.fr/oauth/authorize",
		token_url="https://api.intra.42.fr/oauth/token",
		userinfo_url="https://api.intra.42.fr/v2/me",
		scope="public",
		credentials=lambda settings: (settings.ft_client_id,
			settings.ft_client_secret.get_secret_value()),
		profile=_profile_42),
}


async def get_oauth_http() -> AsyncIterator[httpx.AsyncClient]:
	# por requisição: o callback é raro, e o teste troca por um httpx.MockTransport
	async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_S) as http:
		yield http


OAuthHttp = Annotated[httpx.AsyncClient, Depends(get_oauth_http)]


def redirect_uri(provider: Provider, settings: Settings) -> str:
	# derivada, não configurada: o PUBLIC_HOST é a única fonte do nome público (infra.md, decisão 12)
	return f"https://{settings.public_host}/api/auth/oauth/{provider}/callback"


# ---------- state ----------

def new_state(provider: Provider, lang: str | None, secret: str) -> tuple[str, str]:
	"""(state para a URL do provedor, valor assinado para o cookie oauth_state).

	O cookie guarda o state, o provedor e o idioma da tela, assinados: ninguém troca o provedor nem
	forja um state sem o JWT_SECRET. lang fora da lista é ignorado, sem erro (decisão 21).
	"""
	state = secrets.token_urlsafe(32)
	now = datetime.now(timezone.utc)
	claims = {"state": state, "provider": provider, "typ": STATE_TYPE,
		"iat": now, "exp": now + timedelta(seconds=STATE_TTL_S)}
	if lang in LANGUAGES:
		claims["lang"] = lang
	return state, jwt.encode(claims, secret, algorithm=ALGORITHM)


def check_state(cookie: str | None, state: str | None, provider: Provider, secret: str) -> Language:
	"""O idioma guardado no cookie, se o state e o provedor batem. É a defesa contra CSRF no login."""
	if not cookie or not state:
		raise OAuthFailed("missing state")
	try:
		claims = jwt.decode(cookie, secret, algorithms=[ALGORITHM],
			options={"require": ["exp", "state", "provider", "typ"]})
	except jwt.PyJWTError as error: # vencido, outra assinatura, outro formato
		raise OAuthFailed(f"invalid state cookie: {error}") from None
	if claims["typ"] != STATE_TYPE or claims["provider"] != provider:
		raise OAuthFailed("state cookie of another flow")
	# em bytes: compare_digest recusa str fora do ASCII, e o state da URL vem de fora
	if not secrets.compare_digest(str(claims["state"]).encode(), state.encode()):
		raise OAuthFailed("state mismatch")
	return claims.get("lang", DEFAULT_LANGUAGE)


def authorize_url(provider: Provider, settings: Settings, state: str) -> str:
	adapter = ADAPTERS[provider]
	client_id, _ = adapter.credentials(settings)
	query = urlencode({"client_id": client_id, "redirect_uri": redirect_uri(provider, settings),
		"response_type": "code", "scope": adapter.scope, "state": state})
	return f"{adapter.authorize_url}?{query}"


# ---------- callback ----------

async def fetch_profile(provider: Provider, code: str, settings: Settings,
		http: httpx.AsyncClient) -> Profile:
	"""Troca o code por um token do provedor e lê o User com ele (RFC 6749 §4.1.3)."""
	adapter = ADAPTERS[provider]
	client_id, client_secret = adapter.credentials(settings)
	try:
		token = await http.post(adapter.token_url, data={"grant_type": "authorization_code",
			"code": code, "redirect_uri": redirect_uri(provider, settings),
			"client_id": client_id, "client_secret": client_secret})
		token.raise_for_status()
		me = await http.get(adapter.userinfo_url,
			headers={"Authorization": f"Bearer {token.json()['access_token']}"})
		me.raise_for_status()
		return adapter.profile(me.json())
	# rede, status de erro, JSON inválido ou sem os campos: tudo é oauth_failed.
	# Só o tipo vai para o log: a mensagem do httpx pode trazer a URL
	except (httpx.HTTPError, ValueError, LookupError, TypeError, AttributeError) as error:
		raise OAuthFailed(f"provider request failed: {type(error).__name__}") from None


async def resolve_user(session: AsyncSession, provider: Provider, profile: Profile,
		lang: Language) -> User:
	"""Quem entra (auth.md §2.8, item 3): o já vinculado, o do mesmo e-mail (vinculado agora) ou um novo.

	O commit é de quem chama, junto com o refresh. Dois callbacks do mesmo User novo ao mesmo tempo:
	o segundo esbarra numa UNIQUE e sai com IntegrityError, que o callback trata como oauth_failed.
	"""
	user = await session.scalar(select(User)
		.join(OAuthAccount, OAuthAccount.user_id == User.id)
		.where(OAuthAccount.provider == provider,
			OAuthAccount.provider_user_id == profile.provider_user_id))
	if user is not None:
		return user
	user = await session.scalar(select(User).where(User.email == profile.email))
	if user is None:
		user = await _create_user(session, profile, lang)
	session.add(OAuthAccount(user_id=user.id, provider=provider,
		provider_user_id=profile.provider_user_id))
	await session.flush()
	return user


def base_username(suggested: str) -> str:
	"""Decisão 12: minúsculas, o que não é [a-z0-9_] vira _, até 20 e pelo menos 3 caracteres."""
	name = re.sub(r"[^a-z0-9_]", "_", suggested.lower())[:USERNAME_MAX]
	return name.ljust(USERNAME_MIN, "_")


async def _create_user(session: AsyncSession, profile: Profile, lang: Language) -> User:
	"""Conta só de OAuth (password_hash NULL). Nome já usado ganha sufixo: rdel_fra, rdel_fra2..."""
	base = base_username(profile.suggested_username)
	for n in range(1, MAX_USERNAME_TRIES + 1):
		suffix = str(n) if n > 1 else ""
		user = User(email=profile.email, username=base[:USERNAME_MAX - len(suffix)] + suffix,
			password_hash=None, preferred_language=lang)
		try:
			# a UNIQUE do banco decide, como no signup; o savepoint desfaz só esta tentativa
			async with session.begin_nested():
				session.add(user)
		except IntegrityError as error:
			if _constraint_name(error) != "uq_users_username":
				raise # o e-mail: outro callback criou o mesmo User agora
			continue
		return user
	raise OAuthFailed("no free username")
