# backend/tests/test_logging.py
# Log JSON de auth.md §2.10: uma linha por evento, com request_id, e a linha de acesso sem query.
import io
import json
import logging

import pytest

from app.core.logging import JsonFormatter


pytestmark = pytest.mark.anyio


@pytest.fixture
def lines():
	"""O que o handler JSON escreveria em stdout, linha por linha, já lido; só as do backend."""
	stream = io.StringIO()
	handler = logging.StreamHandler(stream)
	handler.setFormatter(JsonFormatter())
	root = logging.getLogger()
	root.addHandler(handler)
	previous = root.level
	root.setLevel(logging.INFO)

	def read() -> list[dict]:
		parsed = [json.loads(line) for line in stream.getvalue().splitlines()]
		return [line for line in parsed if line["logger"].startswith("app.")] # o httpx do teste também loga
	yield read
	root.removeHandler(handler)
	root.setLevel(previous)


def test_extra_becomes_a_field_and_the_exception_goes_along(lines):
	try:
		raise RuntimeError("boom")
	except RuntimeError:
		logging.getLogger("app.game.rooms").exception("tick failed", extra={"match_id": 12})
	(line,) = lines()
	assert (line["level"], line["logger"], line["msg"], line["match_id"]) == (
		"error", "app.game.rooms", "tick failed", 12)
	assert "RuntimeError: boom" in line["exc"]
	assert line["ts"].endswith("+00:00")
	assert "request_id" not in line # fora de requisição


async def test_every_line_of_a_request_carries_its_request_id(app, client, lines):
	@app.get("/test/noisy")
	async def noisy() -> dict:
		logging.getLogger("app.test").info("inside")
		return {}

	response = await client.get("/test/noisy")
	inside, access = lines()
	assert inside["request_id"] == access["request_id"] == response.headers["x-request-id"]


async def test_the_access_line_has_the_path_but_never_the_query(client, lines):
	await client.get("/api/health?code=secret&state=secret")
	(access,) = lines()
	assert (access["msg"], access["method"], access["path"], access["status"]) == (
		"request", "GET", "/api/health", 200)
	assert "secret" not in json.dumps(access)
	assert access["duration_ms"] >= 0


async def test_an_unhandled_error_is_logged_as_500(app, client, lines):
	@app.get("/test/broken")
	async def broken() -> dict:
		raise RuntimeError("boom")

	response = await client.get("/test/broken")
	assert response.status_code == 500
	error, access = sorted(lines(), key=lambda line: line["msg"] == "request")
	# o traceback sai com o id que o cliente recebeu: é a linha que alguém vai procurar
	assert (error["msg"], error["level"], error["path"]) == ("unhandled error", "error", "/test/broken")
	assert "RuntimeError: boom" in error["exc"]
	assert error["request_id"] == access["request_id"] == response.headers["x-request-id"]
	assert access["status"] == 500


def test_an_extra_cannot_overwrite_the_fixed_fields(lines):
	logging.getLogger("app.test").info("real", extra={"level": "fake", "ts": "fake"})
	(line,) = lines()
	assert (line["msg"], line["level"]) == ("real", "info")
	assert line["ts"] != "fake"
