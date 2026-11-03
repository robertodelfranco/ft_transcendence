"""Entrada e saída das rotas de usuários (i18n.md §2.7).

As regras por campo vêm de app/auth/schemas.py: o username vale igual no cadastro e na edição.
"""
from datetime import datetime
from typing import Annotated, Self

from fastapi import Path, Query
from pydantic import BaseModel, model_validator
from pydantic_core import PydanticCustomError

from app.auth.models import Language
from app.auth.schemas import Input, PublicUser, Username


# o id é BIGINT no Postgres: acima disso o asyncpg recusa o parâmetro, e a rota daria 500
UserId = Annotated[int, Path(ge=1, le=2**63 - 1)]
# prefixo do username, no mesmo alfabeto dele: a casca manda em minúsculas, como no cadastro
Search = Annotated[str, Query(min_length=2, max_length=20, pattern=r"^[a-z0-9_]+$")]
SearchLimit = Annotated[int, Query(ge=1, le=20)]


class UpdateMeIn(Input):
	username: Username | None = None
	preferred_language: Language | None = None

	@model_validator(mode="after")
	def _at_least_one(self) -> Self:
		if self.username is None and self.preferred_language is None:
			raise PydanticCustomError("required", "send username or preferred_language")
		return self


class ProfileUser(PublicUser):
	is_friend: bool # quem pede tem este User como amigo
	is_me: bool


class Friend(PublicUser):
	online: bool # ConnectionManager.is_online: daqui em diante, quem atualiza é o presence do /ws/app
	since: datetime # friendships.created_at


class UserList(BaseModel):
	items: list[PublicUser]


class FriendList(BaseModel):
	items: list[Friend]
