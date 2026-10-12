# backend/tests/test_errors.py
# Envelope de erro de auth.md §2.5: toda rota de qualquer Slice erra neste formato.
import uuid
from typing import Literal

import pytest
from fastapi import FastAPI
from pydantic import BaseModel, Field, field_validator
from pydantic_core import PydanticCustomError

from app.core.errors import ApiError
from app.main import create_app


pytestmark = pytest.mark.anyio


class Pickups(BaseModel):
	mana: bool


class SignupLike(BaseModel):
	username: str = Field(min_length=3, max_length=20, pattern=r"^[a-z0-9_]+$")
	password: str = Field(min_length=8)
	language: Literal["pt-BR", "en", "es"] = "en"
	age: int = 0
	pickups: Pickups | None = None

	@field_validator("password")
	@classmethod
	def strong(cls, value: str) -> str:
		if value.isalpha():
			raise PydanticCustomError("weak_password", "password needs a digit")
		return value


@pytest.fixture
def app(settings) -> FastAPI:
	# o app de verdade, mais três rotas que só existem neste teste
	app = create_app(settings)

	@app.post("/api/test/signup")
	async def signup(body: SignupLike) -> dict[str, str]:
		return {"ok": "yes"}

	@app.get("/api/test/conflict")
	async def conflict() -> None:
		raise ApiError(409, "email_taken", "email already registered")

	@app.get("/api/test/limited")
	async def limited() -> None:
		raise ApiError(429, "rate_limited", "slow down", headers={"Retry-After": "42"})

	@app.get("/api/test/boom")
	async def boom() -> None:
		raise RuntimeError("secret stack detail")

	return app


def envelope(response) -> dict:
	body = response.json()
	assert set(body) == {"error"}
	assert response.headers["X-Request-ID"] == body["error"]["request_id"]
	return body["error"]


async def test_api_error_becomes_envelope(client):
	response = await client.get("/api/test/conflict")
	assert response.status_code == 409
	error = envelope(response)
	assert error["code"] == "email_taken"
	assert error["message"] == "email already registered"
	assert "fields" not in error


async def test_api_error_keeps_its_headers(client):
	response = await client.get("/api/test/limited")
	assert response.status_code == 429
	assert response.headers["Retry-After"] == "42"
	assert envelope(response)["code"] == "rate_limited"


async def test_unknown_route_is_not_found(client):
	response = await client.get("/api/nothing-here")
	assert response.status_code == 404
	assert envelope(response)["code"] == "not_found"


async def test_wrong_method_is_method_not_allowed(client):
	response = await client.post("/api/health")
	assert response.status_code == 405
	assert envelope(response)["code"] == "method_not_allowed"


@pytest.mark.parametrize(("body", "fields"), [
	({"password": "abc12345"}, {"username": "required"}),
	({"username": "ab", "password": "abc12345"}, {"username": "too_short"}),
	({"username": "a" * 21, "password": "abc12345"}, {"username": "too_long"}),
	({"username": "Bad-Name", "password": "abc12345"}, {"username": "invalid_format"}),
	({"username": "augusto", "password": "abcdefgh"}, {"password": "weak_password"}),
	({"username": "augusto", "password": "abc12345", "language": "fr"}, {"language": "invalid_value"}),
	({"username": "augusto", "password": "abc12345", "age": "old"}, {"age": "invalid_value"}),
	({"username": "augusto", "password": "abc12345", "pickups": {"mana": "x"}}, {"pickups.mana": "invalid_value"}),
	({"username": "ab", "password": "short1"}, {"username": "too_short", "password": "too_short"}),
])
async def test_validation_error_has_one_code_per_field(client, body, fields):
	response = await client.post("/api/test/signup", json=body)
	assert response.status_code == 422
	error = envelope(response)
	assert error["code"] == "validation_error"
	assert error["fields"] == fields


async def test_malformed_json_is_validation_error(client):
	response = await client.post("/api/test/signup", content=b"{not json",
		headers={"Content-Type": "application/json"})
	assert response.status_code == 422
	assert envelope(response)["code"] == "validation_error"


async def test_unexpected_error_hides_the_stack(client):
	response = await client.get("/api/test/boom")
	assert response.status_code == 500
	error = envelope(response)
	assert error["code"] == "internal_error"
	assert "secret" not in response.text


async def test_request_id_is_echoed_when_valid(client):
	sent = str(uuid.uuid4())
	response = await client.get("/api/health", headers={"X-Request-ID": sent})
	assert response.headers["X-Request-ID"] == sent


async def test_request_id_is_replaced_when_invalid(client):
	response = await client.get("/api/health", headers={"X-Request-ID": "not-a-uuid"})
	assert uuid.UUID(response.headers["X-Request-ID"])


async def test_each_request_gets_its_own_id(client):
	first = await client.get("/api/health")
	second = await client.get("/api/health")
	assert first.headers["X-Request-ID"] != second.headers["X-Request-ID"]
