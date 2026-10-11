import uuid
from datetime import datetime
from typing import Literal, get_args

from sqlalchemy import BigInteger, CheckConstraint, ForeignKey, Index, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, BigIntPK, CreatedAt, UserFK, in_values


# tabelas de auth.md §2.9; os mesmos valores valem na validação das rotas (F6.2)
Language = Literal["pt-BR", "en", "es"]
Provider = Literal["google", "42"]

LANGUAGES: tuple[Language, ...] = get_args(Language)
PROVIDERS: tuple[Provider, ...] = get_args(Provider)
DEFAULT_LANGUAGE: Language = "en" # o idioma de reserva de i18n.md
USERNAME_PATTERN = r"^[a-z0-9_]{3,20}$"


class User(Base):
	__tablename__ = "users"
	__table_args__ = (
		CheckConstraint("email = lower(email)", name="email_lowercase"),
		CheckConstraint(f"username ~ '{USERNAME_PATTERN}'", name="username_format"),
		CheckConstraint(in_values("preferred_language", LANGUAGES), name="preferred_language"),
	)

	id: Mapped[BigIntPK]
	email: Mapped[str] = mapped_column(unique=True)
	username: Mapped[str] = mapped_column(unique=True)
	password_hash: Mapped[str | None] # NULL = conta só de OAuth
	avatar_url: Mapped[str | None] # NULL = avatar padrão; a API preenche a URL
	preferred_language: Mapped[Language] = mapped_column(server_default=DEFAULT_LANGUAGE)
	created_at: Mapped[CreatedAt]
	last_seen_at: Mapped[datetime | None]


class RefreshToken(Base):
	__tablename__ = "refresh_tokens"
	__table_args__ = (Index("ix_refresh_tokens_family", "family_id"),)

	id: Mapped[BigIntPK]
	user_id: Mapped[UserFK]
	token_hash: Mapped[str] = mapped_column(unique=True) # sha256 em hexadecimal, nunca o token
	family_id: Mapped[uuid.UUID] # uma família por login; reuso revoga todas as linhas dela
	created_at: Mapped[CreatedAt]
	expires_at: Mapped[datetime]
	rotated_at: Mapped[datetime | None] # base da janela de graça de 10 s
	replaced_by: Mapped[int | None] = mapped_column(
		BigInteger, ForeignKey("refresh_tokens.id", ondelete="SET NULL"))
	revoked_at: Mapped[datetime | None]
	user_agent: Mapped[str | None] # cortado em 255 no código, sem CHECK (um login não cai por isso)


class OAuthAccount(Base):
	__tablename__ = "oauth_accounts"
	__table_args__ = (
		CheckConstraint(in_values("provider", PROVIDERS), name="provider"),
		UniqueConstraint("provider", "provider_user_id"),
		UniqueConstraint("user_id", "provider"), # uma conta de cada provedor por User
	)

	id: Mapped[BigIntPK]
	user_id: Mapped[UserFK]
	provider: Mapped[Provider]
	provider_user_id: Mapped[str] # o sub do Google, ou o id da 42 em texto
	created_at: Mapped[CreatedAt]


class Friendship(Base):
	"""Amizade unilateral: user_id adicionou friend_id, sem pedido nem aceite."""

	__tablename__ = "friendships"
	__table_args__ = (
		CheckConstraint("user_id <> friend_id", name="not_self"),
		Index("ix_friendships_friend", "friend_id"), # presença: quem me tem como amigo
	)

	user_id: Mapped[UserFK] = mapped_column(primary_key=True)
	friend_id: Mapped[UserFK] = mapped_column(primary_key=True)
	created_at: Mapped[CreatedAt]
