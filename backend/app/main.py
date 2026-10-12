from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app import health
from app.core.config import Settings, get_settings
from app.core.errors import install_error_handlers
from app.core.request_id import RequestIdMiddleware
from app.game.protocol import CloseCode
from app.ws.manager import ConnectionManager


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
	yield
	# desligamento: todo socket fecha com 4503 e a casca mostra "partida encerrada pelo servidor"
	await app.state.connection_manager.close_all(CloseCode.SERVER_SHUTDOWN)


def create_app(settings: Settings | None = None) -> FastAPI:
	settings = settings or get_settings()
	# a documentação mora em /api/docs: o /docs padrão cairia no frontend pelo Nginx
	is_dev = settings.app_env == "development"
	app = FastAPI(
		title="Catacombs 42",
		docs_url="/api/docs" if is_dev else None,
		redoc_url=None,
		openapi_url="/api/openapi.json" if is_dev else None,
		lifespan=lifespan,
	)
	app.state.settings = settings
	app.state.connection_manager = ConnectionManager() # uma por processo: um worker só

	app.add_middleware(RequestIdMiddleware)
	install_error_handlers(app)
	app.include_router(health.router)
	return app


app = create_app() # é o que o uvicorn sobe: app.main:app
