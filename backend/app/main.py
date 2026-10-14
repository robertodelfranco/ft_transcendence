from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app import health
from app.auth.router import router as auth_router
from app.core.config import Settings, get_settings
from app.core.errors import error_response, install_error_handlers
from app.core.request_id import RequestIdMiddleware
from app.game.protocol import CloseCode
from app.game.rooms import RoomError, RoomManager
from app.matches.router import router as matches_router
from app.matches.service import load_catalog
from app.ws.manager import ConnectionManager


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
	yield
	await app.state.room_manager.close() # nenhuma task de tick sobra
	# desligamento: todo socket fecha com 4503 e a casca mostra "partida encerrada pelo servidor"
	await app.state.connection_manager.close_all(CloseCode.SERVER_SHUTDOWN)


async def handle_room_error(request: Request, exc: RoomError) -> JSONResponse:
	# a recusa do RoomManager já traz status e code; a rota só repassa (rooms.md §2.2)
	return error_response(request, exc.status_code, exc.code, str(exc))


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
	app.state.room_manager = RoomManager(app.state.connection_manager)
	app.state.maps = load_catalog() # GET /api/maps e a validação do POST /api/matches

	app.add_middleware(RequestIdMiddleware)
	install_error_handlers(app)
	app.add_exception_handler(RoomError, handle_room_error)
	app.include_router(health.router)
	app.include_router(auth_router)
	app.include_router(matches_router)
	return app


app = create_app() # é o que o uvicorn sobe: app.main:app
