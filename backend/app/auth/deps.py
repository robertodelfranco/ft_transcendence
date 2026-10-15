"""Dependências que as rotas de todas as Slices usam para saber quem chama (auth.md §2.7)."""
from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.auth.models import User
from app.auth.security import InvalidToken
from app.auth.service import user_from_access_token
from app.core.config import get_app_settings
from app.core.errors import ApiError
from app.db.session import DbSession


# auto_error=False: sem cabeçalho, o 401 sai no envelope do contrato, não no do FastAPI
_bearer = HTTPBearer(auto_error=False)
Bearer = Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)]


def _unauthorized(message: str) -> ApiError:
	return ApiError(401, "unauthorized", message, headers={"WWW-Authenticate": "Bearer"})


async def _user(request: Request, session: DbSession, token: str) -> User:
	secret = get_app_settings(request).jwt_secret.get_secret_value()
	try:
		return await user_from_access_token(session, token, secret)
	except InvalidToken:
		raise _unauthorized("invalid or expired token") from None


async def current_user(request: Request, session: DbSession, credentials: Bearer) -> User:
	if credentials is None:
		raise _unauthorized("missing bearer token")
	return await _user(request, session, credentials.credentials)


async def optional_user(request: Request, session: DbSession, credentials: Bearer) -> User | None:
	# sem token é visitante; token presente e inválido continua 401, para a casca renovar o access
	if credentials is None:
		return None
	return await _user(request, session, credentials.credentials)


CurrentUser = Annotated[User, Depends(current_user)]
OptionalUser = Annotated[User | None, Depends(optional_user)]
