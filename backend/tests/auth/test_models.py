# backend/tests/auth/test_models.py
# As tabelas de usuários conferidas contra auth.md §2.9, sem banco: só o DDL que o Postgres receberia.
import pytest
from sqlalchemy import CheckConstraint, Table, UniqueConstraint
from sqlalchemy.dialects import postgresql
from sqlalchemy.schema import CreateTable

from app.auth.models import LANGUAGES, PROVIDERS, Friendship, OAuthAccount, RefreshToken, User
from app.db.base import Base


PG = postgresql.dialect()
TIMESTAMPTZ = "TIMESTAMP WITH TIME ZONE"

# coluna → (tipo no Postgres, aceita NULL), copiado da §2.9
SCHEMA = {
	"users": {
		"id": ("BIGINT", False),
		"email": ("TEXT", False),
		"username": ("TEXT", False),
		"password_hash": ("TEXT", True),
		"avatar_url": ("TEXT", True),
		"preferred_language": ("TEXT", False),
		"created_at": (TIMESTAMPTZ, False),
		"last_seen_at": (TIMESTAMPTZ, True),
	},
	"refresh_tokens": {
		"id": ("BIGINT", False),
		"user_id": ("BIGINT", False),
		"token_hash": ("TEXT", False),
		"family_id": ("UUID", False),
		"created_at": (TIMESTAMPTZ, False),
		"expires_at": (TIMESTAMPTZ, False),
		"rotated_at": (TIMESTAMPTZ, True),
		"replaced_by": ("BIGINT", True),
		"revoked_at": (TIMESTAMPTZ, True),
		"user_agent": ("TEXT", True),
	},
	"oauth_accounts": {
		"id": ("BIGINT", False),
		"user_id": ("BIGINT", False),
		"provider": ("TEXT", False),
		"provider_user_id": ("TEXT", False),
		"created_at": (TIMESTAMPTZ, False),
	},
	"friendships": {
		"user_id": ("BIGINT", False),
		"friend_id": ("BIGINT", False),
		"created_at": (TIMESTAMPTZ, False),
	},
}


def table(name: str) -> Table:
	return Base.metadata.tables[name]


def ddl(name: str) -> str:
	return str(CreateTable(table(name)).compile(dialect=PG))


def unique_sets(name: str) -> set[tuple[str, ...]]:
	# UNIQUE de coluna única e de várias colunas, no mesmo formato
	constraints = {tuple(c.name for c in uq.columns)
		for uq in table(name).constraints if isinstance(uq, UniqueConstraint)}
	return constraints | {(c.name,) for c in table(name).columns if c.unique}


def checks(name: str) -> dict[str, str]:
	return {ck.name: str(ck.sqltext)
		for ck in table(name).constraints if isinstance(ck, CheckConstraint)}


def foreign_keys(name: str) -> dict[str, tuple[str, str]]:
	# coluna → (coluna referida, ON DELETE)
	return {fk.parent.name: (fk.target_fullname, fk.ondelete) for fk in table(name).foreign_keys}


def test_user_tables_are_in_the_shared_metadata():
	# subconjunto: as tabelas de partidas (F5) entram na mesma Base
	assert set(SCHEMA) <= set(Base.metadata.tables)


@pytest.mark.parametrize("name", SCHEMA)
def test_columns_types_and_nullability(name):
	columns = {c.name: (c.type.compile(dialect=PG), c.nullable) for c in table(name).columns}
	assert columns == SCHEMA[name]


@pytest.mark.parametrize("name", ["users", "refresh_tokens", "oauth_accounts"])
def test_serial_primary_key(name):
	assert [c.name for c in table(name).primary_key] == ["id"]
	assert "id BIGSERIAL NOT NULL" in ddl(name)


@pytest.mark.parametrize("name", SCHEMA)
def test_created_at_defaults_to_now(name):
	assert f"created_at {TIMESTAMPTZ} DEFAULT now() NOT NULL" in ddl(name)


def test_users_constraints():
	assert unique_sets("users") == {("email",), ("username",)}
	assert checks("users") == {
		"ck_users_email_lowercase": "email = lower(email)",
		"ck_users_username_format": "username ~ '^[a-z0-9_]{3,20}$'",
		"ck_users_preferred_language": "preferred_language IN ('pt-BR', 'en', 'es')",
	}
	assert LANGUAGES == ("pt-BR", "en", "es")
	assert "preferred_language TEXT DEFAULT 'en' NOT NULL" in ddl("users")


def test_refresh_tokens_constraints():
	assert unique_sets("refresh_tokens") == {("token_hash",)}
	assert foreign_keys("refresh_tokens") == {
		"user_id": ("users.id", "CASCADE"),
		"replaced_by": ("refresh_tokens.id", "SET NULL"),
	}
	assert {ix.name: [c.name for c in ix.columns] for ix in table("refresh_tokens").indexes} == {
		"ix_refresh_tokens_family": ["family_id"],
	}


def test_oauth_accounts_constraints():
	assert unique_sets("oauth_accounts") == {("provider", "provider_user_id"), ("user_id", "provider")}
	assert checks("oauth_accounts") == {"ck_oauth_accounts_provider": "provider IN ('google', '42')"}
	assert PROVIDERS == ("google", "42")
	assert foreign_keys("oauth_accounts") == {"user_id": ("users.id", "CASCADE")}


def test_friendships_constraints():
	assert [c.name for c in table("friendships").primary_key] == ["user_id", "friend_id"]
	assert checks("friendships") == {"ck_friendships_not_self": "user_id <> friend_id"}
	assert foreign_keys("friendships") == {
		"user_id": ("users.id", "CASCADE"),
		"friend_id": ("users.id", "CASCADE"),
	}
	assert {ix.name: [c.name for c in ix.columns] for ix in table("friendships").indexes} == {
		"ix_friendships_friend": ["friend_id"],
	}


def test_constraint_names_follow_the_convention():
	# é o nome que a migração do Alembic grava; muda só com PR que muda este teste
	names = {c.name for name in SCHEMA for c in table(name).constraints}
	assert {"pk_users", "uq_users_email", "ck_users_username_format",
		"fk_refresh_tokens_user_id_users", "uq_oauth_accounts_provider_provider_user_id",
		"pk_friendships", "ck_friendships_not_self"} <= names


def test_models_map_to_their_tables():
	assert {m.__tablename__ for m in (User, RefreshToken, OAuthAccount, Friendship)} == set(SCHEMA)
