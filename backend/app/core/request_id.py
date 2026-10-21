import uuid
from contextvars import ContextVar

from starlette.requests import Request
from starlette.types import ASGIApp, Message, Receive, Scope, Send


HEADER = "X-Request-ID"
# o log JSON lê daqui (logging.py): toda linha escrita durante a requisição leva o mesmo id
current_request_id: ContextVar[str | None] = ContextVar("request_id", default=None)


def get_request_id(request: Request) -> str:
	# o middleware sempre grava; o fallback cobre requisição que não passou por ele
	return getattr(request.state, "request_id", None) or str(uuid.uuid4())


def _valid_uuid(value: str) -> bool:
	try:
		uuid.UUID(value)
	except ValueError:
		return False
	return True


class RequestIdMiddleware:
	"""Dá um request_id a cada requisição HTTP e devolve no X-Request-ID (auth.md §2.10)."""

	def __init__(self, app: ASGIApp) -> None:
		self.app = app

	async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
		if scope["type"] != "http":
			await self.app(scope, receive, send)
			return

		request = Request(scope)
		incoming = request.headers.get(HEADER, "")
		request_id = incoming if _valid_uuid(incoming) else str(uuid.uuid4())
		# grava no scope: o handler de 500 roda fora deste middleware e lê o mesmo scope
		request.state.request_id = request_id

		async def send_with_header(message: Message) -> None:
			if message["type"] == "http.response.start":
				headers = list(message.get("headers", []))
				if not any(name.lower() == b"x-request-id" for name, _ in headers):
					headers.append((b"x-request-id", request_id.encode()))
				message["headers"] = headers
			await send(message)

		token = current_request_id.set(request_id)
		try:
			await self.app(scope, receive, send_with_header)
		finally:
			current_request_id.reset(token)
