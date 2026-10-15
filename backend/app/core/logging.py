"""Log JSON em stdout, uma linha por evento, com o `request_id` (auth.md §2.10).

O `extra=` dos `log.info(...)` vira campo do JSON. A linha de acesso grava só o caminho, nunca a
query string: o callback do OAuth chega com `?code&state`, que não podem ir para o log.
"""
import json
import logging
import sys
import time
from datetime import datetime, timezone

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.request_id import current_request_id


# atributos que todo LogRecord tem, mais o color_message do uvicorn (o msg com cores ANSI);
# o que sobra veio do extra=
_RECORD_FIELDS = set(vars(logging.makeLogRecord({}))) | {"message", "asctime", "taskName", "color_message"}

log = logging.getLogger("app.access")


class JsonFormatter(logging.Formatter):
	def format(self, record: logging.LogRecord) -> str:
		# o extra= primeiro: um extra chamado "msg" ou "level" não apaga os campos fixos
		line = {k: v for k, v in vars(record).items() if k not in _RECORD_FIELDS}
		line.update({
			"ts": datetime.fromtimestamp(record.created, timezone.utc).isoformat(timespec="milliseconds"),
			"level": record.levelname.lower(),
			"logger": record.name,
			"msg": record.getMessage(),
		})
		if (request_id := current_request_id.get()) is not None:
			line["request_id"] = request_id
		if record.exc_info:
			line["exc"] = self.formatException(record.exc_info)
		# default=str: um extra que não é JSON (datetime, Enum) não derruba a linha
		return json.dumps(line, ensure_ascii=False, default=str)


def configure_logging(level: str) -> None:
	"""Um handler só, no root, e os loggers do uvicorn passam por ele. Chamar de novo não duplica."""
	handler = logging.StreamHandler(sys.stdout)
	handler.setFormatter(JsonFormatter())
	root = logging.getLogger()
	root.handlers = [handler]
	root.setLevel(level.upper())
	for name in ("uvicorn", "uvicorn.error"):
		logging.getLogger(name).handlers = []
		logging.getLogger(name).propagate = True
	# a linha de acesso é a do AccessLogMiddleware, com request_id e sem query
	logging.getLogger("uvicorn.access").disabled = True


class AccessLogMiddleware:
	"""Uma linha por requisição HTTP: método, caminho, status e duração."""

	def __init__(self, app: ASGIApp) -> None:
		self.app = app

	async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
		if scope["type"] != "http":
			await self.app(scope, receive, send)
			return

		status = 500 # se a resposta nem começou, quem responde é o handler de 500
		start = time.perf_counter()

		async def send_and_record(message: Message) -> None:
			nonlocal status
			if message["type"] == "http.response.start":
				status = message["status"]
			await send(message)

		try:
			await self.app(scope, receive, send_and_record)
		finally:
			log.info("request", extra={"method": scope["method"], "path": scope["path"],
				"status": status, "duration_ms": round((time.perf_counter() - start) * 1000, 1)})
