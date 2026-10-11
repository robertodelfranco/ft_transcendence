# backend/tests/conftest.py
# Fixtures de todo o backend. A sessão de banco com rollback entra com a F5.1, e o fake_ws com a F2.1.
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
