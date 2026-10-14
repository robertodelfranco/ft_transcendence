"""Dependências que as rotas de todas as Slices usam para saber quem chama (auth.md §2.7)."""
from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.auth.models import User
from app.auth.security import InvalidToken, decode_access_token
from app.core.config import get_app_settings
from app.core.errors import ApiError
from app.db.session import DbSession


# auto_error=False: sem cabeçalho, o 401 sai no envelope do contrato, não no do FastAPI
_bearer = HTTPBearer(auto_error=False)


def _unauthorized(message: str) -> ApiError:
	return ApiError(401, "unauthorized", message, headers={"WWW-Authenticate": "Bearer"})


async def current_user(request: Request, session: DbSession,
		credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)]) -> User:
	if credentials is None:
		raise _unauthorized("missing bearer token")
	secret = get_app_settings(request).jwt_secret.get_secret_value()
	try:
		user_id = decode_access_token(credentials.credentials, secret)
	except InvalidToken:
		raise _unauthorized("invalid or expired token") from None
	user = await session.get(User, user_id)
	if user is None: # conta apagada depois de o token sair
		raise _unauthorized("user no longer exists")
	return user


CurrentUser = Annotated[User, Depends(current_user)]
