"""Rotas de cadastro, login, sessão e do próprio User (auth.md §2.2)."""
import logging
from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, Request, Response, status
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy.exc import IntegrityError

from app.auth import oauth, service
from app.auth.deps import CurrentUser, same_origin
from app.auth.models import Provider
from app.auth.schemas import AuthResponse, LoginIn, PrivateUser, SignupIn, Unauthenticated
from app.core.config import get_app_settings
from app.core.errors import error_response, ApiError
from app.core.metrics import get_metrics
from app.core.ratelimit import Limit, RateLimit, client_ip
from app.db.session import DbSession


router = APIRouter(prefix="/api/auth", tags=["auth"])
log = logging.getLogger(__name__)

# o limite protege o que é caro (o Argon2) e o que é perigoso (errar a senha), não o uso normal:
# várias abas na mesma máquina, como na demonstração do multiplayer, não esbarram nele
SIGNUPS = Limit(5, 60) # pedidos válidos: o 422 não chega ao Argon2 e não conta
LOGIN_FAILURES = Limit(5, 60) # senhas erradas
LOGIN_ATTEMPTS = RateLimit(30, 60) # teto de tudo: login certo repetido também gasta Argon2
REFRESHES = RateLimit(30, 60)

RefreshCookie = Annotated[str | None, Cookie(alias=service.REFRESH_COOKIE)]
OAuthStateCookie = Annotated[str | None, Cookie(alias=oauth.STATE_COOKIE)]


@router.post("/signup", status_code=status.HTTP_201_CREATED)
async def signup(body: SignupIn, request: Request, response: Response,
		session: DbSession) -> AuthResponse:
	SIGNUPS.hit(request, client_ip(request))
	# signup já faz login (decisão 16): User e refresh no mesmo commit
	user = await service.create_user(session, body)
	# conta nova não tem provider vinculado
	tokens = await service.issue_tokens(session, user, request, response, providers=[])
	await session.commit()
	return tokens


async def login_attempts(request: Request) -> None:
	# o teto conta antes da validação do corpo, como dependência; o 429 dele também é um login recusado
	try:
		await LOGIN_ATTEMPTS(request)
	except ApiError:
		get_metrics(request).login("rate_limited")
		raise


@router.post("/login", dependencies=[Depends(login_attempts)])
async def login(body: LoginIn, request: Request, response: Response,
		session: DbSession) -> AuthResponse:
	metrics = get_metrics(request)
	ip = client_ip(request)
	try:
		# a vaga é reservada antes do Argon2 e devolvida se a senha confere: contar só depois do
		# erro deixaria 50 tentativas simultâneas passarem juntas pela conferência
		LOGIN_FAILURES.hit(request, ip)
	except ApiError:
		metrics.login("rate_limited")
		raise
	try:
		user = await service.authenticate(session, body.email, body.password) # senha errada: a vaga fica
	except ApiError:
		metrics.login("invalid_credentials")
		raise
	LOGIN_FAILURES.refund(request, ip)
	tokens = await service.issue_tokens(session, user, request, response)
	await session.commit()
	metrics.login("success") # depois do commit: login que falhou ao gravar não é sucesso
	return tokens


@router.post("/refresh", dependencies=[Depends(same_origin), Depends(REFRESHES)],
		response_model=AuthResponse | Unauthenticated)
async def refresh(request: Request, response: Response, session: DbSession,
		refresh_token: RefreshCookie = None) -> AuthResponse | Unauthenticated | JSONResponse:
	if not refresh_token:
		return Unauthenticated()
	tokens = await service.rotate_refresh(session, refresh_token, request, response)
	await session.commit() # também no None: o reuso revogou a família
	if tokens is not None:
		return tokens
	# a sessão acabou: o cookie sai na mesma resposta, e a casca vai para o login
	error = error_response(request, 401, "invalid_refresh", "invalid or expired refresh token")
	service.clear_refresh_cookie(error)
	return error


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(same_origin)])
async def logout(response: Response, session: DbSession, refresh_token: RefreshCookie = None) -> None:
	# sempre 204: sair sem sessão, ou duas vezes, não é erro
	if refresh_token:
		await service.revoke_refresh(session, refresh_token)
		await session.commit()
	service.clear_refresh_cookie(response)


@router.get("/me")
async def me(user: CurrentUser, session: DbSession) -> PrivateUser:
	return await service.private_user(session, user)


def _known_provider(provider: str) -> Provider:
	# o Google (#164) cai aqui até ganhar adaptador
	if provider not in oauth.ADAPTERS:
		raise ApiError(404, "not_found", "unknown provider")
	return provider


def _oauth_redirect(url: str) -> RedirectResponse:
	# toda saída do callback apaga o state: cada um vale para um fluxo só
	response = RedirectResponse(url, status.HTTP_302_FOUND)
	response.delete_cookie(oauth.STATE_COOKIE, path=oauth.STATE_COOKIE_PATH, secure=True,
		httponly=True, samesite="lax")
	return response


@router.get("/oauth/{provider}/login")
async def oauth_login(provider: str, request: Request, lang: str | None = None) -> RedirectResponse:
	provider = _known_provider(provider)
	settings = get_app_settings(request)
	state, cookie = oauth.new_state(provider, lang, settings.jwt_secret.get_secret_value())
	response = RedirectResponse(oauth.authorize_url(provider, settings, state), status.HTTP_302_FOUND)
	# Lax, não Strict: o callback é uma navegação que vem da intra (decisão 7)
	response.set_cookie(oauth.STATE_COOKIE, cookie, max_age=oauth.STATE_TTL_S,
		path=oauth.STATE_COOKIE_PATH, secure=True, httponly=True, samesite="lax")
	return response


@router.get("/oauth/{provider}/callback")
async def oauth_callback(provider: str, request: Request, session: DbSession, http: oauth.OAuthHttp,
		code: str | None = None, state: str | None = None, error: str | None = None,
		state_cookie: OAuthStateCookie = None) -> RedirectResponse:
	provider = _known_provider(provider)
	if error == "access_denied": # o User recusou na tela do provedor: não é falha, não conta
		return _oauth_redirect("/login?error=oauth_cancelled")
	settings = get_app_settings(request)
	metrics = get_metrics(request)
	try:
		lang = oauth.check_state(state_cookie, state, provider, settings.jwt_secret.get_secret_value())
		if not code: # outro error do provedor, ou callback aberto à mão
			raise oauth.OAuthFailed("no code")
		profile = await oauth.fetch_profile(provider, code, settings, http)
		user = await oauth.resolve_user(session, provider, profile, lang)
	except (oauth.OAuthFailed, IntegrityError) as failure:
		# o texto do IntegrityError traz o e-mail no SQL: dele, só o tipo
		reason = str(failure) if isinstance(failure, oauth.OAuthFailed) else type(failure).__name__
		log.warning("oauth login failed", extra={"provider": provider, "reason": reason})
		metrics.login("oauth_failed")
		return _oauth_redirect("/login?error=oauth_failed")
	response = _oauth_redirect("/")
	await service.issue_tokens(session, user, request, response) # o refresh vai no próprio 302
	await session.commit()
	metrics.login("oauth_success") # depois do commit, como no login por senha
	return response
