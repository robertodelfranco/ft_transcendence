# Dois envios de avatar do mesmo User ao mesmo tempo (revisão do PR #178), com commits de verdade:
# a fixture db_session usa uma conexão só e não deixa duas requisições se cruzarem no banco.
import asyncio
import secrets

import pytest
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from app.auth.models import User
from app.core.config import Settings
from app.users.avatar import store_avatar
from app.users.router import _replace_avatar


pytestmark = pytest.mark.anyio


@pytest.fixture
def settings(tmp_path):
	return Settings(app_env="test", media_dir=tmp_path)


@pytest.fixture
async def engine(migrated_db, settings):
	engine = create_async_engine(settings.database_url, poolclass=NullPool)
	yield engine
	await engine.dispose()


@pytest.fixture
async def user_id(engine):
	# commit de verdade: as duas sessões precisam enxergar o User, e no fim ele é apagado, já que não
	# há rollback. Nome novo a cada rodada: uma rodada interrompida não trava a próxima
	name = f"race_{secrets.token_hex(4)}"
	async with AsyncSession(engine, expire_on_commit=False) as session:
		user = User(email=f"{name}@example.com", username=name)
		session.add(user)
		await session.commit()
		user_id = user.id
	yield user_id
	async with AsyncSession(engine) as session:
		await session.execute(delete(User).where(User.id == user_id))
		await session.commit()


async def test_a_second_upload_waits_for_the_first_and_removes_its_file(engine, user_id, tmp_path):
	first = AsyncSession(engine, expire_on_commit=False)
	second = AsyncSession(engine, expire_on_commit=False)
	try:
		# as duas requisições carregam o User antes de qualquer commit, como o CurrentUser faz
		user_a = await first.get(User, user_id)
		user_b = await second.get(User, user_id)
		url_a = store_avatar(tmp_path, user_id, b"a")
		url_b = store_avatar(tmp_path, user_id, b"b")

		# o primeiro envio para logo antes do commit, com a URL nova já na sessão
		reached_commit, release = asyncio.Event(), asyncio.Event()
		real_commit = first.commit
		async def commit_later():
			reached_commit.set()
			await release.wait()
			await real_commit()
		first.commit = commit_later

		task_a = asyncio.create_task(_replace_avatar(first, user_a, url_a, tmp_path))
		await reached_commit.wait()
		task_b = asyncio.create_task(_replace_avatar(second, user_b, url_b, tmp_path))
		await asyncio.sleep(0.2)
		assert not task_b.done() # parado na trava da linha, à espera do primeiro commit

		release.set()
		await asyncio.gather(task_a, task_b)

		assert sorted(path.name for path in (tmp_path / "avatars").iterdir()) == [url_b.rsplit("/", 1)[1]]
		async with AsyncSession(engine) as check:
			assert (await check.get(User, user_id)).avatar_url == url_b
	finally:
		await first.close()
		await second.close()
