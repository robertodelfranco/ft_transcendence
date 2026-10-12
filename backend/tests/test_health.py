# backend/tests/test_health.py
import pytest
from httpx import ASGITransport, AsyncClient

from app.core.config import Settings
from app.main import create_app


pytestmark = pytest.mark.anyio


async def test_health_ok(client):
	response = await client.get("/api/health")
	assert response.status_code == 200
	assert response.json() == {"status": "ok"}


async def test_health_without_api_prefix_is_404(client):
	# o backend enxerga /api/... inteiro (infra.md §4, decisão 5)
	response = await client.get("/health")
	assert response.status_code == 404
	assert response.json()["error"]["code"] == "not_found"


async def test_docs_only_in_development(client):
	assert (await client.get("/api/docs")).status_code == 404

	dev_app = create_app(Settings(app_env="development"))
	async with AsyncClient(transport=ASGITransport(app=dev_app), base_url="http://test") as dev:
		assert (await dev.get("/api/docs")).status_code == 200
		assert (await dev.get("/api/openapi.json")).status_code == 200
