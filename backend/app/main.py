import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app import health
from app.auth.router import router as auth_router
from app.core.config import Settings, get_settings
from app.core.errors import error_response, install_error_handlers
from app.core.logging import AccessLogMiddleware, configure_logging
from app.core.metrics import Metrics, MetricsMiddleware
from app.core.metrics import router as metrics_router
from app.core.ratelimit import RateLimitStore
from app.core.request_id import RequestIdMiddleware
from app.game.protocol import CloseCode
from app.game.rooms import RoomError, RoomManager
from app.game.router import router as game_router
from app.matches.router import router as matches_router
from app.db.session import SessionLocal
from app.matches.results import abort_unfinished
from app.matches.service import leave_when_offline, load_catalog
from app.ws.app_events import DbFriendGraph, notify_presence
from app.ws.manager import ConnectionManager
from app.ws.router import router as app_socket_router


log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
	# antes do yield o uvicorn ainda não aceita conexão: nenhum Lobby nasce durante a limpeza.
	# Em teste o lifespan não toca no banco; os testes chamam abort_unfinished direto
	# ponytail: um worker só (arq. §2); com dois, o startup de um abortaria as Rooms vivas do outro
	if app.state.settings.app_env != "test":
		aborted = await abort_unfinished() # o RoomManager nasce vazio: o que está aberto é órfão
		log.info("unfinished matches aborted", extra={"aborted": aborted})
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
	app.state.metrics = metrics = Metrics() # registro por app: os testes não somam contagens
	app.state.connection_manager = ConnectionManager() # uma por processo: um worker só
	app.state.room_manager = RoomManager(app.state.connection_manager,
		on_tick=metrics.tick_seconds.observe)
	# lidos na hora da coleta, não agora: o teste troca as instâncias
	metrics.watch(lambda: app.state.connection_manager.counts(),
		lambda: app.state.room_manager.running_count())
	app.state.rate_limits = RateLimitStore() # por app: cada teste começa com a contagem zerada
	app.state.maps = load_catalog() # GET /api/maps e a validação do POST /api/matches
	# lê o room_manager na hora do aviso, não agora: o teste troca a instância
	app.state.connection_manager.on_presence_change(lambda user_id, online:
		leave_when_offline(app.state.room_manager, app.state.connection_manager, SessionLocal,
			user_id, online))
	# presença para os amigos e last_seen_at (ws-manager.md §2.3); também lido na hora do aviso
	app.state.friend_graph = DbFriendGraph(SessionLocal)
	app.state.connection_manager.on_presence_change(lambda user_id, online:
		notify_presence(app.state.connection_manager, app.state.friend_graph, user_id, online))

	# o último é o de fora: o request_id já existe quando a linha de acesso é escrita
	app.add_middleware(MetricsMiddleware)
	app.add_middleware(AccessLogMiddleware)
	app.add_middleware(RequestIdMiddleware)
	install_error_handlers(app)
	app.add_exception_handler(RoomError, handle_room_error)
	app.include_router(health.router)
	app.include_router(metrics_router)
	app.include_router(auth_router)
	app.include_router(matches_router)
	app.include_router(game_router)
	app.include_router(app_socket_router)
	return app


# depois do logging do uvicorn, que já rodou antes de importar o app: o JSON vale para ele também
configure_logging(get_settings().log_level)
app = create_app() # é o que o uvicorn sobe: app.main:app
