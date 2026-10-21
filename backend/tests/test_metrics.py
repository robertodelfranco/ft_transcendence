# backend/tests/test_metrics.py
# /metrics com as cinco séries de infra.md §2.6 e arq. §12.1; fora do Nginx.
import asyncio
import re
from pathlib import Path

import pytest
from prometheus_client.parser import text_string_to_metric_families

from app.core.metrics import TICK_BUCKETS
from app.game import Mode, RoomOptions
from app.game.rooms import RoomManager
from app.game.world import parse_map
from app.ws.manager import ConnectionManager


pytestmark = pytest.mark.anyio

PROXY = Path(__file__).resolve().parents[2] / "proxy" / "default.conf.template"
SERIES = {"http_requests_total", "auth_login_total", "ws_connections", "game_rooms_active",
	"game_tick_seconds"}
SIGNUP = {"email": "metrics@example.com", "username": "metrics", "password": "senha123"}


async def scrape(client) -> dict[tuple[str, tuple], float]:
	response = await client.get("/metrics")
	assert response.status_code == 200
	assert response.headers["content-type"].startswith("text/plain; version=0.0.4")
	return {(sample.name, tuple(sorted(sample.labels.items()))): sample.value
		for family in text_string_to_metric_families(response.text) for sample in family.samples}


def value(samples, name: str, **labels) -> float:
	return samples.get((name, tuple(sorted(labels.items()))), 0.0)


async def test_the_five_series_are_there_from_the_start(client):
	response = await client.get("/metrics")
	families = {family.name for family in text_string_to_metric_families(response.text)}
	# o parser tira o _total dos counters
	assert {name.removesuffix("_total") for name in SERIES} <= families

	samples = await scrape(client)
	for result in ("success", "invalid_credentials", "rate_limited", "oauth_success", "oauth_failed"):
		assert ("auth_login_total", (("result", result),)) in samples
	assert value(samples, "ws_connections", channel="app") == 0
	assert value(samples, "ws_connections", channel="game") == 0
	assert value(samples, "game_rooms_active") == 0
	assert ("game_tick_seconds_bucket", (("le", "0.033"),)) in samples # o limite do alerta de p99
	assert 0.033 in TICK_BUCKETS


async def test_no_created_series_doubles_the_output(client):
	await client.get("/api/health")
	samples = await scrape(client)
	assert not [name for name, _ in samples if name.endswith("_created")]


async def test_requests_are_counted_by_route_template_and_never_by_path(client):
	for match_id in (1, 2, 3):
		assert (await client.get(f"/api/matches/{match_id}")).status_code == 401
	await client.get("/api/health")
	await client.get("/api/nao/existe/42")
	samples = await scrape(client)

	assert value(samples, "http_requests_total", route="/api/matches/{match_id}", status="401") == 3
	assert value(samples, "http_requests_total", route="/api/health", status="200") == 1
	assert value(samples, "http_requests_total", route="unmatched", status="404") == 1
	routes = {dict(labels).get("route") for name, labels in samples if name == "http_requests_total"}
	assert not any(re.search(r"/\d+", route) for route in routes) # nenhum id em label


async def test_a_login_rate_limit_is_counted(client):
	# corpo inválido não chega ao banco, mas gasta o teto de 30 tentativas
	for _ in range(30):
		assert (await client.post("/api/auth/login", json={})).status_code == 422
	assert (await client.post("/api/auth/login", json={})).status_code == 429
	assert value(await scrape(client), "auth_login_total", result="rate_limited") == 1


async def test_logins_are_counted_by_result(client, db_session):
	await client.post("/api/auth/signup", json=SIGNUP)
	login = {"email": SIGNUP["email"], "password": SIGNUP["password"]}
	assert (await client.post("/api/auth/login", json=login)).status_code == 200
	assert (await client.post("/api/auth/login", json={**login, "password": "errada123"})).status_code == 401
	samples = await scrape(client)
	assert value(samples, "auth_login_total", result="success") == 1 # o signup não conta
	assert value(samples, "auth_login_total", result="invalid_credentials") == 1


async def test_sockets_rooms_and_ticks_are_read_from_the_live_state(client, app, fake_ws):
	# managers próprios: o do app avisa a presença ao banco a cada aba que abre e fecha. A coleta
	# lê o app.state na hora, então a troca também prova que nada ficou preso à instância antiga
	connections = app.state.connection_manager = ConnectionManager(close_timeout_s=0.05)
	tick_seconds = app.state.metrics.tick_seconds.observe
	rooms = app.state.room_manager = RoomManager(connections, on_tick=tick_seconds,
		load=lambda name, mode: parse_map("11111\n1NNN1\n11111\n", name, mode))
	tabs = [await connections.connect(7, "app", fake_ws()), await connections.connect(7, "app", fake_ws())]
	await connections.connect(7, "game", fake_ws(), match_id=12)
	rooms.create(12, Mode.COOP, "arena", 3, RoomOptions(), created_by=7)
	rooms.join(12, 7, "user7", "/media/avatars/default.png")
	rooms.create(13, Mode.COOP, "arena", 3, RoomOptions(), created_by=9) # ainda no Lobby: não conta
	rooms.join(13, 9, "user9", "/media/avatars/default.png")
	rooms.start(12)
	try:
		await asyncio.sleep(0.2) # uns 6 Ticks
		samples = await scrape(client)
		assert value(samples, "ws_connections", channel="app") == 2
		assert value(samples, "ws_connections", channel="game") == 1
		assert value(samples, "game_rooms_active") == 1
		ticks = value(samples, "game_tick_seconds_count")
		assert ticks >= 3
		assert value(samples, "game_tick_seconds_bucket", le="+Inf") == ticks

		await connections.disconnect(tabs[0])
		assert value(await scrape(client), "ws_connections", channel="app") == 1
	finally:
		await rooms.close()
		await connections.close_all(1000)


def test_the_proxy_only_sends_api_and_ws_to_the_backend():
	# /metrics não pode sair para fora do compose: o Nginx só repassa estes dois prefixos
	text = PROXY.read_text(encoding="utf-8")
	blocks = re.findall(r"location\s+(?:=\s*)?(\S+)\s*\{([^}]*)\}", text)
	to_backend = {path for path, body in blocks if "proxy_pass http://backend" in body}
	assert to_backend == {"/api/", "/ws/"}
	assert "metrics" not in text
