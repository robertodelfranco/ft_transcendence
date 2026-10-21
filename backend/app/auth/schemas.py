"""Entrada e saída das rotas de auth (auth.md §2.2, §2.3 e §2.4).

Cada regra devolve o `code` por campo do contrato: o tipo do PydanticCustomError já é o code,
e os erros nativos (missing, string_too_long...) são traduzidos em app/core/errors.py.
"""
import string
from datetime import datetime
from typing import Annotated, Literal

from email_validator import EmailNotValidError, validate_email
from pydantic import AfterValidator, BaseModel, BeforeValidator, ConfigDict, StringConstraints
from pydantic_core import PydanticCustomError

from app.auth.models import DEFAULT_LANGUAGE, USERNAME_PATTERN, Language, Provider


MAX_EMAIL_LENGTH = 254
MIN_PASSWORD_LENGTH = 8
MAX_PASSWORD_LENGTH = 128 # o Argon2 é caro de propósito: sem teto, senha de 1 MB vira DoS (decisão 17)
DEFAULT_AVATAR_URL = "/media/avatars/default.png" # o banco guarda NULL (decisão 18)


# ---------- regras por campo (§2.4) ----------

def _normalize(value: object) -> object:
	# antes de tudo, até do pattern (que o Pydantic confere antes do to_lower). Quem não é texto
	# passa intacto e o modo strict recusa
	return value.strip().lower() if isinstance(value, str) else value


def _email_format(value: str) -> str:
	try:
		# só a sintaxe: conferir o domínio no DNS deixaria o cadastro lento e dependente de rede
		validate_email(value, check_deliverability=False)
	except EmailNotValidError:
		raise PydanticCustomError("invalid_format", "invalid e-mail address") from None
	return value


def _strong_password(value: str) -> str:
	# letra de qualquer alfabeto ("ação" conta), dígito só 0-9: o mesmo \d do front
	if not any(char.isalpha() for char in value) or not any(char in string.digits for char in value):
		raise PydanticCustomError("weak_password", "password needs a letter and a digit")
	return value


def _not_empty(value: str) -> str:
	if not value:
		raise PydanticCustomError("required", "password is required")
	return value


# " Ana@X.com " é o mesmo e-mail que "ana@x.com"
Email = Annotated[str, BeforeValidator(_normalize), StringConstraints(max_length=MAX_EMAIL_LENGTH),
	AfterValidator(_email_format)]
Username = Annotated[str, BeforeValidator(_normalize),
	StringConstraints(min_length=3, max_length=20, pattern=USERNAME_PATTERN)]
# senha sem normalização nenhuma: espaço conta
NewPassword = Annotated[str, StringConstraints(min_length=MIN_PASSWORD_LENGTH,
	max_length=MAX_PASSWORD_LENGTH), AfterValidator(_strong_password)]
# no login, só o teto: dizer "senha fraca" revelaria a regra a quem testa senhas
LoginPassword = Annotated[str, StringConstraints(max_length=MAX_PASSWORD_LENGTH),
	AfterValidator(_not_empty)]


class Input(BaseModel):
	# strict: 123 não vira "123"; extra="forbid": campo desconhecido é 422, não é ignorado
	model_config = ConfigDict(strict=True, extra="forbid")


class SignupIn(Input):
	email: Email
	username: Username
	password: NewPassword
	preferred_language: Language = DEFAULT_LANGUAGE


class LoginIn(Input):
	email: Email
	password: LoginPassword


# ---------- saída (§2.2 e §2.3) ----------

class PublicUser(BaseModel):
	id: int
	username: str
	avatar_url: str
	created_at: datetime


class PrivateUser(PublicUser):
	email: str
	preferred_language: Language
	has_password: bool
	providers: list[Provider] # em ordem alfabética


class Unauthenticated(BaseModel):
	"""/refresh sem cookie: o estado normal de quem chega, não um erro (decisão 4)."""
	authenticated: Literal[False] = False


class AuthResponse(BaseModel):
	authenticated: Literal[True] = True
	access_token: str
	token_type: Literal["bearer"] = "bearer"
	expires_in: int
	user: PrivateUser
