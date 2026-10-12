# backend/tests/conftest.py
# Fixtures de todo o backend. A sessão de banco com rollback entra com a F5.1.
import asyncio
import json

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.config import Settings
from app.main import create_app


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
