"""Perfil, avatar e amigos (i18n.md §2.7). Ler o próprio perfil é GET /api/auth/me, do auth."""
from fastapi import APIRouter

from app.auth.deps import CurrentUser
from app.auth.schemas import PrivateUser
from app.auth.service import private_user
from app.db.session import DbSession
from app.users import service
from app.users.schemas import ProfileUser, UpdateMeIn, UserId


router = APIRouter(prefix="/api/users", tags=["users"])


@router.patch("/me")
async def update_me(body: UpdateMeIn, user: CurrentUser, session: DbSession) -> PrivateUser:
	await service.update_me(session, user, body)
	await session.commit()
	return await private_user(session, user)


@router.get("/{user_id}")
async def get_profile(user_id: UserId, user: CurrentUser, session: DbSession) -> ProfileUser:
	return await service.profile(session, user, user_id)