"""As séries do backend para o Prometheus (arq. §12.1, infra.md §2.6): nomes e labels são contrato.

Cada app tem o próprio registro, criado no `create_app()`: os testes criam vários apps, e um registro
global somaria a contagem de todos. As contagens que já existem em memória (sockets abertos, Rooms
em partida) são lidas na hora da coleta, e não mantidas com inc/dec: não há como o número divergir
do estado de verdade.

`/metrics` fica fora do `/api`: o Nginx só repassa `/api/` e `/ws/`, então só a rede interna do
compose alcança a rota. Nenhuma label leva `user_id`, `match_id` ou caminho com id.
"""
from collections.abc import Callable, Iterator, Mapping
from typing import Literal

from fastapi import APIRouter, Request, Response
from prometheus_client import (CONTENT_TYPE_LATEST, CollectorRegistry, Counter, Histogram,
	disable_created_metrics, generate_latest)
from prometheus_client.core import GaugeMetricFamily
from prometheus_client.registry import Collector
from starlette.requests import HTTPConnection
from starlette.types import ASGIApp, Message, Receive, Scope, Send


LoginResult = Literal["success", "invalid_credentials", "rate_limited", "oauth_success", "oauth_failed"]
LOGIN_RESULTS: tuple[LoginResult, ...] = ("success", "invalid_credentials", "rate_limited",
	"oauth_success", "oauth_failed")
CHANNELS = ("app", "game")
UNMATCHED_ROUTE = "unmatched" # 404 de caminho inventado: um valor só, senão cada scan vira série
# em torno do orçamento de 33 ms (30 Hz): o alerta de p99 precisa de um limite exatamente nele
TICK_BUCKETS = (0.001, 0.002, 0.005, 0.01, 0.02, 0.033, 0.05, 0.1, 0.25)

router = APIRouter()

# sem isto, cada counter e histograma ganha uma série *_created com o horário em que nasceu: o dobro
# de séries de http_requests, que nenhum dashboard ou alerta usa
disable_created_metrics()


class _Live(Collector):
	"""Gauges lidos do estado em memória a cada coleta."""

	def __init__(self, sockets: Callable[[], Mapping[str, int]], rooms: Callable[[], int]) -> None:
		self._sockets = sockets
		self._rooms = rooms

	def collect(self) -> Iterator[GaugeMetricFamily]:
		connections = GaugeMetricFamily("ws_connections", "WebSockets abertos, por canal",
			labels=["channel"])
		counts = self._sockets()
		for channel in CHANNELS: # os dois canais sempre, mesmo zerados
			connections.add_metric([channel], counts.get(channel, 0))
		yield connections
		yield GaugeMetricFamily("game_rooms_active", "Rooms em partida, com o tick rodando",
			value=self._rooms())


class Metrics:
	def __init__(self) -> None:
		self.registry = CollectorRegistry()
		self._http = Counter("http_requests", "Requisições HTTP respondidas",
			["route", "status"], registry=self.registry)
		self._logins = Counter("auth_login", "Tentativas de login, por resultado",
			["result"], registry=self.registry)
		self.tick_seconds = Histogram("game_tick_seconds", "Trabalho de um Tick: step e envio",
			buckets=TICK_BUCKETS, registry=self.registry)
		for result in LOGIN_RESULTS: # a série existe desde o início: rate() sobre série ausente é vazio
			self._logins.labels(result)

	def watch(self, sockets: Callable[[], Mapping[str, int]], rooms: Callable[[], int]) -> None:
		self.registry.register(_Live(sockets, rooms))

	def login(self, result: LoginResult) -> None:
		self._logins.labels(result).inc()

	def request(self, route: str, status: int) -> None:
		self._http.labels(route, str(status)).inc()

	def render(self) -> bytes:
		return generate_latest(self.registry)


def get_metrics(connection: HTTPConnection) -> Metrics:
	return connection.app.state.metrics


class MetricsMiddleware:
	"""Conta cada requisição HTTP pelo template da rota (`/api/matches/{match_id}`), nunca pelo caminho."""

	def __init__(self, app: ASGIApp) -> None:
		self.app = app

	async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
		if scope["type"] != "http":
			await self.app(scope, receive, send)
			return

		status = 500 # se a resposta nem começou, quem responde é o handler de 500

		async def send_and_record(message: Message) -> None:
			nonlocal status
			if message["type"] == "http.response.start":
				status = message["status"]
			await send(message)

		try:
			await self.app(scope, receive, send_and_record)
		finally:
			# o roteador grava a rota que casou no mesmo scope
			route = getattr(scope.get("route"), "path", UNMATCHED_ROUTE)
			scope["app"].state.metrics.request(route, status)


@router.get("/metrics", include_in_schema=False)
async def metrics(request: Request) -> Response:
	# async de propósito: a coleta lê os dicionários do ConnectionManager e do RoomManager, que só
	# podem ser percorridos de dentro do event loop
	return Response(get_metrics(request).render(), media_type=CONTENT_TYPE_LATEST)
