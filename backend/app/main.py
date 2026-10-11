from fastapi import FastAPI

from app import health
from app.core.config import Settings, get_settings
from app.core.errors import install_error_handlers
from app.core.request_id import RequestIdMiddleware


def create_app(settings: Settings | None = None) -> FastAPI:
	settings = settings or get_settings()
	# a documentação mora em /api/docs: o /docs padrão cairia no frontend pelo Nginx
	is_dev = settings.app_env == "development"
	app = FastAPI(
		title="Catacombs 42",
		docs_url="/api/docs" if is_dev else None,
		redoc_url=None,
		openapi_url="/api/openapi.json" if is_dev else None,
	)
	app.state.settings = settings

	app.add_middleware(RequestIdMiddleware)
	install_error_handlers(app)
	app.include_router(health.router)
	return app


app = create_app() # é o que o uvicorn sobe: app.main:app
