"""Limite de requisições por IP ou por User (auth.md §2.7): 429 `rate_limited` com `Retry-After`.

A contagem vive em memória, no `app.state.rate_limits` (um worker só, arq. §2). A janela é
deslizante: "5 por minuto" é no máximo 5 em quaisquer 60 s, sem a rajada de 10 que uma janela fixa
deixa passar na virada do minuto.

Duas formas de usar:
- `Depends(RateLimit(10, 60, key="user"))`: conta toda requisição que chega à rota.
- `Limit(5, 60)` chamado dentro da rota: conta só o que o código decide (o login devolve a vaga
  quando a senha confere, o signup só conta o pedido que passou da validação).
"""
import math
import time
from collections import deque
from collections.abc import Callable, Hashable
from typing import Literal

from starlette.requests import HTTPConnection, Request

from app.auth.deps import CurrentUser
from app.core.errors import ApiError


Clock = Callable[[], float]
SWEEP_EVERY_S = 60.0 # de quanto em quanto tempo as janelas vazias saem da memória


class RateLimitStore:
	"""As janelas de todos os limites do app; o teste cria o app com um relógio próprio."""

	def __init__(self, clock: Clock = time.monotonic) -> None:
		self._clock = clock
		self._hits: dict[tuple[Hashable, Hashable], tuple[float, deque[float]]] = {}
		self._next_sweep = clock() + SWEEP_EVERY_S

	def hit(self, limit: Hashable, key: Hashable, times: int, seconds: float) -> float | None:
		"""Conta uma requisição. None se cabe; senão, quantos segundos até caber a próxima."""
		now = self._clock()
		if now >= self._next_sweep:
			self._sweep(now)
		entry = self._hits.get((limit, key))
		if entry is None:
			entry = self._hits[(limit, key)] = (seconds, deque())
		window = entry[1] # no máximo `times` horários: a memória por IP não cresce com o ataque
		while window and window[0] <= now - seconds:
			window.popleft()
		if len(window) >= times:
			return window[0] + seconds - now # a recusa não conta: quem espera o Retry-After passa
		window.append(now)
		return None

	def refund(self, limit: Hashable, key: Hashable) -> None:
		"""Devolve uma vaga contada. As vagas da janela são iguais, então sai a mais recente."""
		entry = self._hits.get((limit, key))
		if entry is not None and entry[1]:
			entry[1].pop()

	def _sweep(self, now: float) -> None:
		# sem isto, cada IP que já passou por aqui ficaria na memória para sempre
		self._hits = {k: (seconds, window) for k, (seconds, window) in self._hits.items()
			if window and window[-1] > now - seconds}
		self._next_sweep = now + SWEEP_EVERY_S


def get_rate_limits(connection: HTTPConnection) -> RateLimitStore:
	return connection.app.state.rate_limits


def client_ip(request: Request) -> str:
	# o IP real vem do uvicorn --proxy-headers, com o X-Forwarded-For que o Nginx grava
	return request.client.host if request.client else "unknown"


class Limit:
	"""Um limite com a própria contagem (a instância é a chave no store)."""

	def __init__(self, times: int, seconds: float) -> None:
		if times < 1 or seconds <= 0:
			raise ValueError("a limit needs times >= 1 and seconds > 0")
		self.times = times
		self.seconds = seconds

	def hit(self, request: Request, key: Hashable) -> None:
		"""Conta uma vaga, ou levanta 429 se a janela está cheia. Não tem await: conferir e contar
		acontecem juntos, e pedidos simultâneos não passam todos pela mesma vaga."""
		retry_after = get_rate_limits(request).hit(self, key, self.times, self.seconds)
		if retry_after is not None:
			raise ApiError(429, "rate_limited", f"limit is {self.times} per {self.seconds:g} s",
				headers={"Retry-After": str(max(1, math.ceil(retry_after)))})

	def refund(self, request: Request, key: Hashable) -> None:
		get_rate_limits(request).refund(self, key)


def RateLimit(times: int, seconds: float, key: Literal["ip", "user"] = "ip") -> Callable:
	"""Dependência: `Depends(RateLimit(5, 60))`. Conta toda requisição que chega à rota."""
	limit = Limit(times, seconds)
	if key == "ip":
		async def by_ip(request: Request) -> None:
			limit.hit(request, client_ip(request))
		return by_ip

	async def by_user(request: Request, user: CurrentUser) -> None: # o CurrentUser fica em cache na requisição
		limit.hit(request, user.id)
	return by_user
