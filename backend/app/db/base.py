import uuid
from collections.abc import Iterable
from datetime import datetime
from typing import Annotated, Literal

from sqlalchemy import BigInteger, DateTime, ForeignKey, MetaData, Text, Uuid, func
from sqlalchemy.orm import DeclarativeBase, mapped_column


# nomes previsíveis para toda restrição: o Alembic gera a mesma migração em qualquer máquina
NAMING_CONVENTION = {
	"pk": "pk_%(table_name)s",
	"fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
	"uq": "uq_%(table_name)s_%(column_0_N_name)s",
	"ck": "ck_%(table_name)s_%(constraint_name)s",
	"ix": "ix_%(table_name)s_%(column_0_N_name)s",
}


class Base(DeclarativeBase):
	"""Base de todas as tabelas do backend: usuários (F6) e partidas (F5) num metadata só."""

	metadata = MetaData(naming_convention=NAMING_CONVENTION)
	# tipos do contrato (rooms.md 2.7): texto é TEXT, e todo carimbo de tempo é TIMESTAMPTZ.
	# Literal também é TEXT (e não ENUM nem VARCHAR(n)): os valores aceitos ficam num CHECK
	type_annotation_map = {
		str: Text,
		Literal: Text,
		datetime: DateTime(timezone=True),
		uuid.UUID: Uuid,
	}


# colunas que se repetem nas tabelas de todas as Slices
BigIntPK = Annotated[int, mapped_column(BigInteger, primary_key=True)] # vira BIGSERIAL
CreatedAt = Annotated[datetime, mapped_column(server_default=func.now())]
UserFK = Annotated[int, mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"))]


def in_values(column: str, values: Iterable[str]) -> str:
	# texto de um CHECK ... IN (...) a partir de constantes do código, nunca de entrada do User
	return f"{column} IN ({', '.join(f"'{value}'" for value in values)})"
