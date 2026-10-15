"""Rotas de cadastro, login e do próprio User (auth.md §2.2). /refresh e /logout entram na F6.3."""
from fastapi import APIRouter, Depends, Request, Response, status

from app.auth import service
from app.auth.deps import CurrentUser
from app.auth.schemas import AuthResponse, LoginIn, PrivateUser, SignupIn
from app.core.ratelimit import Limit, RateLimit, client_ip
from app.db.session import DbSession


router = APIRouter(prefix="/api/auth", tags=["auth"])

# o limite protege o que é caro (o Argon2) e o que é perigoso (errar a senha), não o uso normal:
# várias abas na mesma máquina, como na demonstração do multiplayer, não esbarram nele
SIGNUPS = Limit(5, 60) # pedidos válidos: o 422 não chega ao Argon2 e não conta
LOGIN_FAILURES = Limit(5, 60) # senhas erradas
LOGIN_ATTEMPTS = RateLimit(30, 60) # teto de tudo: login certo repetido também gasta Argon2


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


@router.post("/login", dependencies=[Depends(LOGIN_ATTEMPTS)])
async def login(body: LoginIn, request: Request, response: Response,
		session: DbSession) -> AuthResponse:
	ip = client_ip(request)
	# a vaga é reservada antes do Argon2 e devolvida se a senha confere: contar só depois do erro
	# deixaria 50 tentativas simultâneas passarem juntas pela conferência
	LOGIN_FAILURES.hit(request, ip)
	user = await service.authenticate(session, body.email, body.password) # senha errada: a vaga fica
	LOGIN_FAILURES.refund(request, ip)
	tokens = await service.issue_tokens(session, user, request, response)
	await session.commit()
	return tokens


@router.get("/me")
async def me(user: CurrentUser, session: DbSession) -> PrivateUser:
	return await service.private_user(session, user)
