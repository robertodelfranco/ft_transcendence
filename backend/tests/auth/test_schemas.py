# backend/tests/auth/test_schemas.py
# Regras de entrada de auth.md §2.4: cada campo inválido devolve o code do contrato.
import pytest
from pydantic import ValidationError

from app.auth.schemas import LoginIn, SignupIn
from app.core.errors import validation_fields


VALID = {"email": "augusto@example.com", "username": "augusto", "password": "senha123"}


def fields_of(model, data: dict) -> dict[str, str]:
	with pytest.raises(ValidationError) as refused:
		model.model_validate(data)
	return validation_fields(refused.value.errors())


def test_email_and_username_are_normalized():
	data = SignupIn.model_validate({**VALID, "email": "  Augusto@Example.COM ", "username": " AuGusto_1 "})
	assert (data.email, data.username) == ("augusto@example.com", "augusto_1")


def test_password_is_never_normalized():
	assert SignupIn.model_validate({**VALID, "password": " Senha 123 "}).password == " Senha 123 "


def test_preferred_language_defaults_to_english():
	assert SignupIn.model_validate(VALID).preferred_language == "en"


@pytest.mark.parametrize("change, expected", [
	({"email": "sem-arroba"}, {"email": "invalid_format"}),
	({"email": ""}, {"email": "invalid_format"}),
	({"email": "a" * 245 + "@example.com"}, {"email": "too_long"}),
	({"username": "ab"}, {"username": "too_short"}),
	({"username": "a" * 21}, {"username": "too_long"}),
	({"username": "com-hifen"}, {"username": "invalid_format"}),
	({"password": "curta1"}, {"password": "too_short"}),
	({"password": "a1" * 65}, {"password": "too_long"}),
	({"password": "somenteletras"}, {"password": "weak_password"}),
	({"password": "12345678"}, {"password": "weak_password"}),
	({"password": "senha١٢٣"}, {"password": "weak_password"}), # dígito árabe não é 0-9
	({"preferred_language": "fr"}, {"preferred_language": "invalid_value"}),
	({"username": 123}, {"username": "invalid_value"}), # strict: número não vira texto
	({"is_admin": True}, {"is_admin": "invalid_value"}), # campo desconhecido
])
def test_signup_field_codes(change, expected):
	assert fields_of(SignupIn, {**VALID, **change}) == expected


@pytest.mark.parametrize("missing", ["email", "username", "password"])
def test_signup_missing_field_is_required(missing):
	data = {key: value for key, value in VALID.items() if key != missing}
	assert fields_of(SignupIn, data) == {missing: "required"}


def test_login_does_not_reveal_the_signup_rules():
	# senha fraca passa no schema do login: quem confere é o hash
	assert LoginIn.model_validate({"email": VALID["email"], "password": "abc"}).password == "abc"


@pytest.mark.parametrize("password, code", [("", "required"), ("a" * 129, "too_long")])
def test_login_password_codes(password, code):
	assert fields_of(LoginIn, {"email": VALID["email"], "password": password}) == {"password": code}


def test_letters_of_any_alphabet_count():
	assert SignupIn.model_validate({**VALID, "password": "çãé12345"}).password == "çãé12345"
