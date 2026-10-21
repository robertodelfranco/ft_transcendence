"""O que chega pelo `/ws/app` sem o cliente pedir: lobby ao vivo e presença (ws-manager.md §2.3 e §2.5).

O lobby (F5.2) publica pelas três funções `publish_*`, sempre depois do `commit` da rota, e o
`create_app()` liga `notify_presence` ao `ConnectionManager`. O manager não sabe o que é amizade
(decisão 3): quem consulta `friendships` é o `FriendGraph`, que o teste troca por um dicionário.
"""
from collections.abc import Callable, Iterable
from typing import Protocol

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import HTTPConnection

from app.auth.models import Friendship, User
from app.game.rooms import RoomInfo
from app.ws.manager import ConnectionManager
from app.ws.messages import (LobbyRemovedReason, encode_lobby_removed, encode_lobby_update,
	encode_match_started, encode_presence)


# ---------- lobby (§2.5): quem chama é o Akita ----------

async def publish_lobby_update(manager: ConnectionManager, info: RoomInfo) -> None:
	"""Room em lobby criada ou mudada: vai para todo /ws/app aberto (decisão 4)."""
	await manager.broadcast_all(encode_lobby_update(info.to_payload()))


async def publish_lobby_removed(manager: ConnectionManager, match_id: int,
		reason: LobbyRemovedReason) -> None:
	"""A Room saiu do lobby: começou ou foi destruída."""
	await manager.broadcast_all(encode_lobby_removed(match_id, reason))


async def publish_match_started(manager: ConnectionManager, match_id: int,
		user_ids: Iterable[int]) -> None:
	"""Só os Players da Room: é o aviso para a casca abrir /play/{match_id}."""
	await manager.broadcast(user_ids, encode_match_started(match_id), "app")


# ---------- amizade ----------

class FriendGraph(Protocol):
	async def friends_of(self, user_id: int) -> list[int]: ... # quem o User adicionou
	async def watchers_of(self, user_id: int) -> list[int]: ... # quem adicionou o User
	async def mark_seen(self, user_id: int) -> None: ... # grava users.last_seen_at


class DbFriendGraph:
	"""`friendships` no Postgres. Cada consulta abre e fecha a própria sessão: o socket vive
	horas, e segurar uma conexão do pool esse tempo todo o esgotaria (como no authenticate_ws_token)."""

	def __init__(self, sessions: Callable[[], AsyncSession]) -> None:
		self._sessions = sessions

	async def friends_of(self, user_id: int) -> list[int]:
		async with self._sessions() as session:
			return list(await session.scalars(
				select(Friendship.friend_id).where(Friendship.user_id == user_id)))

	async def watchers_of(self, user_id: int) -> list[int]:
		# a amizade é unilateral (auth.md §2.9): a presença vai para quem tem o User como amigo,
		# pelo índice ix_friendships_friend
		async with self._sessions() as session:
			return list(await session.scalars(
				select(Friendship.user_id).where(Friendship.friend_id == user_id)))

	async def mark_seen(self, user_id: int) -> None:
		async with self._sessions() as session:
			await session.execute(update(User).where(User.id == user_id).values(last_seen_at=func.now()))
			await session.commit()


def get_friend_graph(connection: HTTPConnection) -> FriendGraph:
	"""Dependência do FastAPI; o teste troca a instância em app.state."""
	return connection.app.state.friend_graph


# ---------- presença (§2.3) ----------

async def online_friends(manager: ConnectionManager, friends: FriendGraph, user_id: int) -> list[int]:
	"""Os amigos do User que estão online agora: é o estado inicial do welcome."""
	return sorted(f for f in await friends.friends_of(user_id) if manager.is_online(f))


async def notify_presence(manager: ConnectionManager, friends: FriendGraph, user_id: int,
		online: bool) -> None:
	"""Callback de on_presence_change: o manager já aplicou o atraso de 5 s do offline."""
	watchers = await friends.watchers_of(user_id)
	# a consulta suspende: se o User voltou (ou saiu) nesse meio-tempo, este aviso ficou velho, e o
	# aviso do estado novo já está a caminho. Sem isto, o mais lento dos dois venceria na tela dos amigos
	if manager.is_online(user_id) != online:
		return
	await manager.broadcast(watchers, encode_presence(user_id, online), "app")
	if not online: # depois do aviso: se o banco falhar, os amigos ao menos já sabem
		await friends.mark_seen(user_id)
