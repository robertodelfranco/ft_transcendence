# backend/tests/conftest.py
# Fixtures de todo o backend.
import asyncio
import json
import os
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import Settings
from app.db.session import get_session
from app.main import create_app

ALEMBIC_INI = Path(__file__).parent.parent / "alembic.ini"


@pytest.fixture
def anyio_backend():
	# o plugin do anyio vem com o FastAPI: teste async é marcado com pytest.mark.anyio
	return "asyncio"


@pytest.fixture
def settings():
	return Settings(app_env="test")


@pytest.fixture
def app(settings):
	return create_app(settings)


@pytest.fixture
async def client(app):
	# raise_app_exceptions=False: um erro 500 chega ao teste como resposta, como chegaria ao navegador
	transport = ASGITransport(app=app, raise_app_exceptions=False)
	async with AsyncClient(transport=transport, base_url="http://test") as c:
		yield c


class FakeWebSocket:
	"""Socket falso (ws-manager.md §2.11): grava o que recebe e simula queda e lentidão."""

	def __init__(self) -> None:
		self.sent: list[str] = []
		self.close_code: int | None = None
		self.broken = False # True: o próximo envio falha, como um socket que caiu
		self.flowing = asyncio.Event() # clear(): o envio trava, como um cliente que não lê
		self.flowing.set()

	async def send_text(self, data: str) -> None:
		await self.flowing.wait()
		if self.broken or self.close_code is not None:
			raise ConnectionError("socket is closed")
		self.sent.append(data)

	async def close(self, code: int = 1000, reason: str | None = None) -> None:
		if self.close_code is None:
			self.close_code = code

	@property
	def messages(self) -> list[dict]:
		return [json.loads(text) for text in self.sent]


@pytest.fixture
def fake_ws():
	# devolve a classe: cada chamada é um socket novo (várias abas, vários Users)
	return FakeWebSocket


@pytest.fixture(scope="session")
def migrated_db():
	# sync de propósito: o env.py roda o próprio asyncio.run, que não pode estar dentro do loop de um teste
	try:
		command.upgrade(Config(str(ALEMBIC_INI)), "head")
	except OSError as error:
		# no CI o banco é obrigatório; na máquina, sem Postgres, só os testes de banco são pulados
		if os.environ.get("CI"):
			raise
		pytest.skip(f"sem Postgres ({error}): veja backend/README.md")


@pytest.fixture
async def db_session(migrated_db, app, settings):
	"""Sessão numa transação que sempre sofre rollback; o commit de uma rota vira SAVEPOINT."""
	# NullPool: cada teste tem o seu event loop, e conexão do asyncpg não passa de um loop para outro
	engine = create_async_engine(settings.database_url, poolclass=NullPool)
	async with engine.connect() as connection:
		await connection.begin()
		session = AsyncSession(bind=connection, expire_on_commit=False,
			join_transaction_mode="create_savepoint")
		app.dependency_overrides[get_session] = lambda: session # as rotas recebem esta mesma sessão
		yield session
		await session.close()
		await connection.rollback()
	await engine.dispose()
