"""Perfil, avatar e amigos (i18n.md §2.7). Ler o próprio perfil é GET /api/auth/me, do auth."""
from pathlib import Path

from fastapi import APIRouter, Depends, Request, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import CurrentUser
from app.auth.models import User
from app.auth.schemas import PrivateUser
from app.auth.service import private_user
from app.core.config import get_app_settings
from app.core.errors import ApiError
from app.core.ratelimit import RateLimit
from app.db.session import DbSession
from app.users import service
from app.users.avatar import MAX_AVATAR_BYTES, InvalidAvatar, discard_avatar, save_avatar
from app.users.schemas import ProfileUser, UpdateMeIn, UserId


router = APIRouter(prefix="/api/users", tags=["users"])

# regravar com o Pillow custa CPU (i18n.md §2.7); o uso normal é um envio de vez em quando
AVATAR_UPLOADS = RateLimit(10, 60, key="user")


@router.patch("/me")
async def update_me(body: UpdateMeIn, user: CurrentUser, session: DbSession) -> PrivateUser:
	await service.update_me(session, user, body)
	await session.commit()
	return await private_user(session, user)


@router.put("/me/avatar", dependencies=[Depends(AVATAR_UPLOADS)])
async def put_avatar(file: UploadFile, request: Request, user: CurrentUser,
		session: DbSession) -> PrivateUser:
	# um byte além do limite basta para saber que passou, sem ler o resto
	data = await file.read(MAX_AVATAR_BYTES + 1)
	if len(data) > MAX_AVATAR_BYTES:
		raise ApiError(413, "avatar_too_large", "avatar is larger than 2 MiB")
	media_dir = get_app_settings(request).media_dir
	try:
		url = await save_avatar(data, media_dir, user.id)
	except InvalidAvatar:
		raise ApiError(422, "avatar_invalid", "not a PNG, JPEG or WebP image") from None
	await _replace_avatar(session, user, url, media_dir)
	return await private_user(session, user)


@router.delete("/me/avatar")
async def delete_avatar(request: Request, user: CurrentUser, session: DbSession) -> PrivateUser:
	await _replace_avatar(session, user, None, get_app_settings(request).media_dir)
	return await private_user(session, user)


@router.get("/{user_id}")
async def get_profile(user_id: UserId, user: CurrentUser, session: DbSession) -> ProfileUser:
	return await service.profile(session, user, user_id)


async def _replace_avatar(session: AsyncSession, user: User, url: str | None, media_dir: Path) -> None:
	"""Troca a URL no banco e só depois apaga o arquivo antigo: se o banco falhar, quem some é o novo."""
	try:
		# FOR UPDATE: outro envio do mesmo User espera este commit e lê a URL que ele gravou. Sem a
		# trava, os dois leem a mesma URL antiga e o arquivo de quem fez commit primeiro fica órfão
		await session.refresh(user, ["avatar_url"], with_for_update=True)
		old = user.avatar_url
		user.avatar_url = url
		await session.commit()
	except Exception:
		discard_avatar(media_dir, url)
		raise
	discard_avatar(media_dir, old) # unlink é instantâneo: não vale uma thread
	