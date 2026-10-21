# backend/tests/auth/test_refresh_race.py
# Rotação e reuso da mesma família em transações independentes, com commit de verdade: a corrida que
# o db_session (uma transação só, com rollback) não consegue mostrar.
import asyncio
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import Request, Response
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.auth.models import RefreshToken, User
from app.auth.security import new_refresh_token
from app.auth.service import rotate_refresh


pytestmark = pytest.mark.anyio

BLOCKED_S = 0.3 # tempo para a transação que espera chegar ao lock


@pytest.fixture
async def sessions(migrated_db, settings):
	engine = create_async_engine(settings.database_url, poolclass=NullPool)
	yield async_sessionmaker(engine, expire_on_commit=False)
	await engine.dispose()


@pytest.fixture
async def family(sessions):
	"""A rotacionado para B há 20 s, os dois commitados. Devolve (A, B) em claro e o family_id."""
	async with sessions() as session:
		user = User(email=f"{uuid.uuid4().hex[:12]}@example.com", username=f"r{uuid.uuid4().hex[:12]}")
		session.add(user)
		await session.flush()
		family_id = uuid.uuid4()
		now = datetime.now(timezone.utc)
		(a, a_hash), (b, b_hash) = new_refresh_token(), new_refresh_token()
		row_b = RefreshToken(user_id=user.id, token_hash=b_hash, family_id=family_id,
			expires_at=now + timedelta(days=7))
		session.add(row_b)
		await session.flush()
		session.add(RefreshToken(user_id=user.id, token_hash=a_hash, family_id=family_id,
			expires_at=now + timedelta(days=7), rotated_at=now - timedelta(seconds=20),
			replaced_by=row_b.id))
		await session.commit()
	yield a, b, family_id
	async with sessions() as session: # o CASCADE leva os tokens
		await session.execute(delete(User).where(User.id == user.id))
		await session.commit()


def request(app) -> Request:
	return Request({"type": "http", "headers": [], "app": app})


async def revoked(sessions, family_id) -> list[bool]:
	async with sessions() as session:
		rows = await session.scalars(select(RefreshToken)
			.where(RefreshToken.family_id == family_id).order_by(RefreshToken.id))
		return [row.revoked_at is not None for row in rows]


async def reuse(sessions, app, token: str) -> None:
	async with sessions() as session:
		assert await rotate_refresh(session, token, request(app), Response()) is None
		await session.commit()


async def test_reuse_waiting_on_a_rotation_also_revokes_the_new_successor(sessions, app, family):
	a, b, family_id = family
	async with sessions() as rotating:
		# B vira C, ainda sem commit
		assert await rotate_refresh(rotating, b, request(app), response := Response()) is not None
		c = response.headers["set-cookie"].split(";")[0].split("=", 1)[1]
		revoking = asyncio.create_task(reuse(sessions, app, a))
		await asyncio.sleep(BLOCKED_S)
		assert not revoking.done() # esperando o lock da família
		await rotating.commit()
	await revoking

	assert await revoked(sessions, family_id) == [True, True, True] # B, A e C
	async with sessions() as session:
		assert await rotate_refresh(session, c, request(app), Response()) is None


async def test_a_rotation_waiting_on_a_reuse_finds_the_family_revoked(sessions, app, family):
	a, b, family_id = family
	async with sessions() as revoking:
		assert await rotate_refresh(revoking, a, request(app), Response()) is None # revoga, sem commit
		rotating = asyncio.create_task(reuse(sessions, app, b))
		await asyncio.sleep(BLOCKED_S)
		assert not rotating.done()
		await revoking.commit()
	await rotating # B foi relido depois do lock: revogado, sem sucessor

	assert await revoked(sessions, family_id) == [True, True]


async def test_two_refreshes_with_the_same_cookie_open_one_successor(sessions, app, family):
	_, b, family_id = family
	async with sessions() as first:
		assert await rotate_refresh(first, b, request(app), first_response := Response()) is not None
		assert "set-cookie" in first_response.headers

		async def second() -> Response:
			async with sessions() as session:
				response = Response()
				assert await rotate_refresh(session, b, request(app), response) is not None
				await session.commit()
				return response

		waiting = asyncio.create_task(second())
		await asyncio.sleep(BLOCKED_S)
		assert not waiting.done()
		await first.commit()
	assert "set-cookie" not in (await waiting).headers # janela de graça, sem outro sucessor
	assert await revoked(sessions, family_id) == [False, False, False]
