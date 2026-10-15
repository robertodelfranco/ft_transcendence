"""Rotas de lobby (matches-api.md §2.2)."""
from typing import Annotated, Any

from fastapi import APIRouter, Depends, status

from app.auth.deps import CurrentUser
from app.auth.schemas import DEFAULT_AVATAR_URL
from app.db.session import DbSession
from app.game import Mode
from app.game.rooms import RoomManager, get_room_manager
from app.matches import service
from app.matches.schemas import CreateMatchIn, ReadyIn
from app.matches.service import Catalog, get_catalog


router = APIRouter(prefix="/api", tags=["matches"])

Rooms = Annotated[RoomManager, Depends(get_room_manager)]
Maps = Annotated[Catalog, Depends(get_catalog)]


@router.post("/matches", status_code=status.HTTP_201_CREATED)
async def create_match(body: CreateMatchIn, user: CurrentUser, session: DbSession,
		rooms: Rooms, catalog: Maps) -> dict[str, Any]:
	info = await service.create_match(session, rooms, catalog, user, body)
	return info.to_payload()


@router.get("/matches")
async def list_matches(_: CurrentUser, rooms: Rooms, mode: Mode | None = None) -> dict[str, Any]:
	# só Rooms em lobby, da memória, nunca do banco (matches-api.md decisão 1)
	return {"items": [info.to_payload() for info in rooms.list_open()
		if mode is None or info.mode == mode]}


@router.get("/matches/{match_id}")
async def get_match(match_id: int, _: CurrentUser, rooms: Rooms) -> dict[str, Any]:
	# só a Room viva por enquanto; o MatchDetail de partida terminada vem com a F5.3
	return rooms.info(match_id).to_payload()


@router.post("/matches/{match_id}/join")
async def join_match(match_id: int, user: CurrentUser, rooms: Rooms) -> dict[str, Any]:
	avatar_url = user.avatar_url or DEFAULT_AVATAR_URL
	return rooms.join(match_id, user.id, user.username, avatar_url).to_payload()


@router.post("/matches/{match_id}/leave", status_code=status.HTTP_204_NO_CONTENT)
async def leave_match(match_id: int, user: CurrentUser, session: DbSession, rooms: Rooms) -> None:
	await service.leave_match(session, rooms, match_id, user.id)


@router.post("/matches/{match_id}/ready")
async def set_ready(match_id: int, body: ReadyIn, user: CurrentUser, rooms: Rooms) -> dict[str, Any]:
	return rooms.set_ready(match_id, user.id, body.ready).to_payload()


@router.post("/matches/{match_id}/start", status_code=status.HTTP_204_NO_CONTENT)
async def start_match(match_id: int, user: CurrentUser, session: DbSession, rooms: Rooms) -> None:
	await service.start_match(session, rooms, match_id, user.id)


@router.get("/maps")
async def list_maps(_: CurrentUser, catalog: Maps) -> dict[Mode, list[service.MapInfo]]:
	return catalog
