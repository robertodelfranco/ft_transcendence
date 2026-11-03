"""Regras de perfil, avatar e amigos (i18n.md §2.7).

Como em auth/service.py, nenhuma função aqui faz commit: quem escreve é a rota.
"""
from datetime import datetime

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import Friendship, User
from app.auth.schemas import DEFAULT_AVATAR_URL, PublicUser
from app.core.errors import ApiError
from app.users.schemas import Friend, ProfileUser, UpdateMeIn
from app.ws.manager import ConnectionManager


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


async def search_users(session: AsyncSession, me: User, prefix: str, 
		limit: int) -> list[PublicUser]:
	# autoescape: "_" é coringa no LIKE, e "a_b" acharia "axb"
	users = await session.scalars(select(User)
		.where(User.username.startswith(prefix, autoescape=True), User.id != me.id)
		.order_by(User.username).limit(limit))
	return [public_user(user) for user in users]


def friend(user: User, since: datetime, connections: ConnectionManager) -> Friend:
	# is_online, e não os dicionários do manager (ws-manager.md §2.3): é a mesma regra do /ws/app
	return Friend(**public_user(user).model_dump(), online=connections.is_online(user.id), since=since)


async def list_friends(session: AsyncSession, me: User, connections: ConnectionManager) -> list[Friend]:
	rows = await session.execute(select(User, Friendship.created_at)
		.join(Friendship, Friendship.friend_id == User.id)
		.where(Friendship.user_id == me.id)
		.order_by(User.username))
	return [friend(user, since, connections) for user, since in rows]


async def add_friend(session: AsyncSession, me: User, friend_id: int,
		connections: ConnectionManager) -> Friend:
	if friend_id == me.id:
		raise ApiError(409, "cannot_friend_self", "cannot add yourself as a friend")
	user = await session.get(User, friend_id)
	if user is None:
		raise ApiError(404, "user_not_found", "user not found")
	# idempotente (i18n.md §2.7): adicionar de novo não é erro, e o since continua o da primeira vez
	await session.execute(insert(Friendship).values(user_id=me.id, friend_id=friend_id)
		.on_conflict_do_nothing())
	since = await session.scalar(select(Friendship.created_at)
		.where(Friendship.user_id == me.id, Friendship.friend_id == friend_id))
	return friend(user, since, connections)


async def remove_friend(session: AsyncSession, me: User, friend_id: int) -> None:
	"""Idempotente: remover quem não é amigo, ou nem existe, também termina em 204."""
	await session.execute(delete(Friendship)
		.where(Friendship.user_id == me.id, Friendship.friend_id == friend_id))
