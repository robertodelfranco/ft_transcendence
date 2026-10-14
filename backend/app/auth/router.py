"""Rotas de cadastro, login e do próprio User (auth.md §2.2). /refresh e /logout entram na F6.3."""
from fastapi import APIRouter, Request, Response, status

from app.auth import service
from app.auth.deps import CurrentUser
from app.auth.schemas import AuthResponse, LoginIn, PrivateUser, SignupIn
from app.db.session import DbSession


router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/signup", status_code=status.HTTP_201_CREATED)
async def signup(body: SignupIn, request: Request, response: Response,
		session: DbSession) -> AuthResponse:
	# signup já faz login (decisão 16): User e refresh no mesmo commit
	user = await service.create_user(session, body)
	# conta nova não tem provider vinculado
	tokens = await service.issue_tokens(session, user, request, response, providers=[])
	await session.commit()
	return tokens


@router.post("/login")
async def login(body: LoginIn, request: Request, response: Response,
		session: DbSession) -> AuthResponse:
	user = await service.authenticate(session, body.email, body.password)
	tokens = await service.issue_tokens(session, user, request, response)
	await session.commit()
	return tokens


@router.get("/me")
async def me(user: CurrentUser, session: DbSession) -> PrivateUser:
	return await service.private_user(session, user)
