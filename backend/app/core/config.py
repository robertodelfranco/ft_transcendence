from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
	# lê do ambiente; no compose, o .env chega por env_file (infra.md §2.5)
	model_config = SettingsConfigDict(extra="ignore")

	# cada tarefa acrescenta só o que usa: POSTGRES_* com a F5.1, JWT_SECRET com a F6.2
	app_env: Literal["development", "production", "test"] = "development"
	log_level: str = "info"


@lru_cache
def get_settings() -> Settings:
	return Settings()
