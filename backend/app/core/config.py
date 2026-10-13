from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import URL


class Settings(BaseSettings):
	# lê do ambiente; no compose, o .env chega por env_file (infra.md §2.5)
	model_config = SettingsConfigDict(extra="ignore")

	# cada tarefa acrescenta só o que usa: JWT_SECRET com a F6.2
	app_env: Literal["development", "production", "test"] = "development"
	log_level: str = "info"

	# os defaults servem o pytest fora do Docker; no compose, o .env manda
	postgres_user: str = "postgres"
	postgres_password: str = ""
	postgres_db: str = "transcendence"
	postgres_host: str = "localhost"
	postgres_port: int = 5432

	@property
	def database_url(self) -> URL:
		# URL.create escapa a senha: "@" ou "/" nela não quebram a URL (sem DATABASE_URL, infra.md §2.5)
		return URL.create(
			"postgresql+asyncpg",
			username=self.postgres_user,
			password=self.postgres_password,
			host=self.postgres_host,
			port=self.postgres_port,
			database=self.postgres_db,
		)


@lru_cache
def get_settings() -> Settings:
	return Settings()
