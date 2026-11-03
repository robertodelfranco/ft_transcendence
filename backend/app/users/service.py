"""Regras de perfil, avatar e amigos (i18n.md §2.7).

Como em auth/service.py, nenhuma função aqui faz commit: quem escreve é a rota.
"""
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import Friendship, User
from app.auth.schemas import DEFAULT_AVATAR_URL, PublicUser
from app.core.errors import ApiError
from app.users.schemas import ProfileUser, UpdateMeIn


USERNAME_UNIQUE = "uq_users_username" # o nome que a convenção do db/base.py dá à UNIQUE


def public_user(user: User) -> PublicUser:
	return PublicUser(id=user.id, username=user.username,
				   avatar_url=user.avatar_url or DEFAULT_AVATAR_URL, created_at=user.created_at)


async def update_me(session: AsyncSession, user: User, data: UpdateMeIn) -> None:
	"""UPDATE direto, como o cadastro: a UNIQUE do banco decide quem fica com o username."""
	try:
		# as mudanças entram dentro do savepoint: o conflito desfaz só elas
		async with session.begin_nested():
			if data.username is not None:
				user.username = data.username
			if data.preferred_language is not None:
				user.preferred_language = data.preferred_language
	except IntegrityError as error:
		# o asyncpg põe o nome da restrição na causa, como no cadastro
		if getattr(error.orig.__cause__, "constraint_name", None) != USERNAME_UNIQUE:
			raise
		raise ApiError(409, "username_taken", "username taken") from None
	

async def profile(session: AsyncSession, me: User, user_id: int) -> ProfileUser:
	user = await session.get(User, user_id)
	if user is None:
		raise ApiError(404, "user_not_found", "user not found")
	# chave composta na ordem da tabela, (user_id, friend_id): "eu adicionei ele"
	is_friend = await session.get(Friendship, (me.id, user.id)) is not None
	return ProfileUser(**public_user(user).model_dump(), is_friend=is_friend, is_me=user.id == me.id)
