"""Rotas de lobby (matches-api.md §2.2), estatísticas, histórico e leaderboard (§2.3) e resultado (§2.4)."""
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Response, status

from app.auth.deps import CurrentUser
from app.auth.schemas import DEFAULT_AVATAR_URL
from app.db.session import DbSession
from app.game import Mode
from app.game.rooms import RoomManager, get_room_manager
from app.matches import service
from app.matches.schemas import (CharacterIn, CreateMatchIn, Leaderboard, LeaderboardMetric, Limit, MatchDetail,
	MatchHistoryPage, MatchId, Page, PerPage, ReadyIn, UserAchievements, UserStats)
from app.matches.service import Catalog, get_catalog
from app.users.schemas import UserId
from app.ws.app_events import publish_lobby_update
from app.ws.manager import ConnectionManager, get_connection_manager


router = APIRouter(prefix="/api", tags=["matches"])

Rooms = Annotated[RoomManager, Depends(get_room_manager)]
Maps = Annotated[Catalog, Depends(get_catalog)]
Connections = Annotated[ConnectionManager, Depends(get_connection_manager)]


@router.post("/matches", status_code=status.HTTP_201_CREATED)
async def create_match(body: CreateMatchIn, user: CurrentUser, session: DbSession,
		rooms: Rooms, connections: Connections, catalog: Maps) -> dict[str, Any]:
	info = await service.create_match(session, rooms, connections, catalog, user, body)
	return info.to_payload()


@router.get("/matches")
async def list_matches(_: CurrentUser, rooms: Rooms, mode: Mode | None = None) -> dict[str, Any]:
	# só Rooms em lobby, da memória, nunca do banco (matches-api.md decisão 1)
	return {"items": [info.to_payload() for info in rooms.list_open()
		if mode is None or info.mode == mode]}


@router.get("/matches/current", response_model=None)
async def current_match(user: CurrentUser, rooms: Rooms) -> dict[str, Any] | Response:
	# a Room do User (lobby ou running), para a casca oferecer a volta durante o Grace period.
	# Antes de /matches/{match_id}: depois dela, "current" cairia no int do path e daria 422
	match_id = rooms.room_of(user.id)
	if match_id is None:
		return Response(status_code=status.HTTP_204_NO_CONTENT)
	return rooms.info(match_id).to_payload()


@router.get("/matches/{match_id}")
async def get_match(match_id: int, _: CurrentUser, rooms: Rooms) -> dict[str, Any]:
	# só a Room viva; o Match terminado sai do banco em /result (matches-api.md decisão 8)
	return rooms.info(match_id).to_payload()


@router.get("/matches/{match_id}/result")
async def get_match_result(match_id: MatchId, _: CurrentUser, session: DbSession) -> MatchDetail:
	# qualquer User logado: o link do histórico de terceiros abre esta rota (decisão 7)
	return await service.match_result(session, match_id)


@router.post("/matches/{match_id}/join")
async def join_match(match_id: int, user: CurrentUser, rooms: Rooms,
		connections: Connections) -> dict[str, Any]:
	avatar_url = user.avatar_url or DEFAULT_AVATAR_URL
	info = rooms.join(match_id, user.id, user.username, avatar_url)
	await publish_lobby_update(connections, info) # join e ready não tocam o banco: nada a esperar
	return info.to_payload()


@router.post("/matches/{match_id}/leave", status_code=status.HTTP_204_NO_CONTENT)
async def leave_match(match_id: int, user: CurrentUser, session: DbSession, rooms: Rooms,
		connections: Connections) -> None:
	await service.leave_match(session, rooms, connections, match_id, user.id)


@router.post("/matches/{match_id}/ready")
async def set_ready(match_id: int, body: ReadyIn, user: CurrentUser, rooms: Rooms,
		connections: Connections) -> dict[str, Any]:
	info = rooms.set_ready(match_id, user.id, body.ready)
	await publish_lobby_update(connections, info)
	return info.to_payload()


@router.post("/matches/{match_id}/character")
async def set_character(match_id: int, body: CharacterIn, user: CurrentUser, rooms: Rooms,
		connections: Connections) -> dict[str, Any]:
	info = rooms.set_character(match_id, user.id, body.character_id)
	await publish_lobby_update(connections, info)
	return info.to_payload()


@router.post("/matches/{match_id}/start", status_code=status.HTTP_204_NO_CONTENT)
async def start_match(match_id: int, user: CurrentUser, session: DbSession, rooms: Rooms,
		connections: Connections) -> None:
	await service.start_match(session, rooms, connections, match_id, user.id)


@router.get("/maps")
async def list_maps(_: CurrentUser, catalog: Maps) -> dict[Mode, list[service.MapInfo]]:
	return catalog


@router.get("/users/{user_id}/stats")
async def get_user_stats(user_id: UserId, _: CurrentUser, session: DbSession) -> UserStats:
	# qualquer User logado: o perfil de terceiros usa a mesma rota (decisão 7)
	return await service.user_stats(session, user_id)


@router.get("/users/{user_id}/achievements")
async def get_user_achievements(user_id: UserId, _: CurrentUser, session: DbSession) -> UserAchievements:
	# qualquer User logado: o perfil de terceiros usa a mesma rota (decisão 7)
	return await service.user_achievements(session, user_id)


@router.get("/users/{user_id}/matches")
async def get_user_matches(user_id: UserId, _: CurrentUser, session: DbSession, page: Page = 1,
		per_page: PerPage = 20, mode: Mode | None = None) -> MatchHistoryPage:
	# qualquer User logado: o histórico de terceiros usa a mesma rota (decisão 7)
	return await service.match_history(session, user_id, page, per_page, mode)


@router.get("/leaderboard")
async def get_leaderboard(_: CurrentUser, session: DbSession, mode: Mode,
		metric: LeaderboardMetric | None = None, limit: Limit = 20) -> Leaderboard:
	# mode obrigatório: a métrica padrão depende dele (xp no coop, elo no pvp)
	return await service.leaderboard(session, mode, metric, limit)
