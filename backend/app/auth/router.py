"""Rotas de cadastro, login, sessão e do próprio User (auth.md §2.2)."""
from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, Request, Response, status
from fastapi.responses import JSONResponse

from app.auth import service
from app.auth.deps import CurrentUser, same_origin
from app.auth.schemas import AuthResponse, LoginIn, PrivateUser, SignupIn, Unauthenticated
from app.core.errors import error_response, ApiError
from app.core.metrics import get_metrics
from app.core.ratelimit import Limit, RateLimit, client_ip
from app.db.session import DbSession


router = APIRouter(prefix="/api/auth", tags=["auth"])

# o limite protege o que é caro (o Argon2) e o que é perigoso (errar a senha), não o uso normal:
# várias abas na mesma máquina, como na demonstração do multiplayer, não esbarram nele
SIGNUPS = Limit(5, 60) # pedidos válidos: o 422 não chega ao Argon2 e não conta
LOGIN_FAILURES = Limit(5, 60) # senhas erradas
LOGIN_ATTEMPTS = RateLimit(30, 60) # teto de tudo: login certo repetido também gasta Argon2
REFRESHES = RateLimit(30, 60)

RefreshCookie = Annotated[str | None, Cookie(alias=service.REFRESH_COOKIE)]


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
