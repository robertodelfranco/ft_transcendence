import secrets
from functools import lru_cache
from typing import Literal, Self

from pydantic import PositiveInt, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import URL
from starlette.requests import HTTPConnection


MIN_SECRET_BYTES = 32 # auth.md §2.6
# sem JWT_SECRET fora de produção: um segredo do processo, o mesmo em toda instância de Settings.
# Reiniciar o backend derruba as sessões, o que em desenvolvimento não faz falta
_EPHEMERAL_SECRET = secrets.token_urlsafe(MIN_SECRET_BYTES)


class Settings(BaseSettings):
	# lê do ambiente; no compose, o .env chega por env_file (infra.md §2.5)
	model_config = SettingsConfigDict(extra="ignore")

	# cada tarefa acrescenta só o que usa
	app_env: Literal["development", "production", "test"] = "development"
	log_level: str = "info"

	# os defaults servem o pytest fora do Docker; no compose, o .env manda
	postgres_user: str = "postgres"
	postgres_password: str = ""
	postgres_db: str = "transcendence"
	postgres_host: str = "localhost"
	postgres_port: int = 5432

	# tokens (auth.md §2.6); SecretStr não aparece em log nem em repr
	jwt_secret: SecretStr = SecretStr("")
	access_token_ttl_s: PositiveInt = 900
	refresh_token_ttl_s: PositiveInt = 604800

	@model_validator(mode="after")
	def _require_a_strong_secret(self) -> Self:
		secret = self.jwt_secret.get_secret_value()
		if not secret and self.app_env != "production":
			self.jwt_secret = SecretStr(_EPHEMERAL_SECRET)
		elif len(secret.encode()) < MIN_SECRET_BYTES:
			raise ValueError(f"JWT_SECRET needs at least {MIN_SECRET_BYTES} bytes")
		return self

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


def get_app_settings(connection: HTTPConnection) -> Settings:
	"""As Settings do app que atende a requisição: o teste cria o app com as suas (create_app)."""
	return connection.app.state.settings
