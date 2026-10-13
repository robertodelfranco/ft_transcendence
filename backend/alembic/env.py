import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import Connection
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

# o metadata só conhece as tabelas dos módulos importados: tabela nova num módulo novo entra aqui
import app.auth.models  # noqa: F401
import app.matches.models  # noqa: F401
from app.core.config import get_settings
from app.db.base import Base


config = context.config
if config.config_file_name is not None:
	# False: o conftest roda a migração e não pode calar os loggers do app
	fileConfig(config.config_file_name, disable_existing_loggers=False)


def run_migrations(connection: Connection) -> None:
	# Base.metadata é o schema esperado: é o que o alembic check compara com o banco
	context.configure(connection=connection, target_metadata=Base.metadata)
	with context.begin_transaction():
		context.run_migrations()


async def main() -> None:
	# a mesma URL do app (POSTGRES_*); NullPool porque a migração usa uma conexão e sai
	engine = create_async_engine(get_settings().database_url, poolclass=NullPool)
	async with engine.connect() as connection:
		# o Alembic é síncrono por dentro: run_sync roda ele sobre a conexão async
		await connection.run_sync(run_migrations)
	await engine.dispose()


asyncio.run(main())
