import logging
from collections.abc import Mapping, Sequence
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.request_id import HEADER, get_request_id


# os code por campo de auth.md §2.5; um erro do Pydantic com esse tipo passa direto
FIELD_CODES = {"required", "invalid_format", "too_short", "too_long", "weak_password", "invalid_value"}

# tipo do erro no Pydantic → code por campo; o que não está aqui vira invalid_value
PYDANTIC_TO_FIELD_CODE = {
	"missing": "required",
	"string_too_short": "too_short",
	"string_too_long": "too_long",
	"string_pattern_mismatch": "invalid_format",
	"value_error": "invalid_format", # é o erro do EmailStr
}

# status → code geral, para o HTTPException do Starlette (rota inexistente, método errado...)
STATUS_TO_CODE = {
	400: "validation_error",
	401: "unauthorized",
	403: "forbidden",
	404: "not_found",
	405: "method_not_allowed",
	413: "payload_too_large",
	422: "validation_error",
	429: "rate_limited",
}

LOCATIONS = {"body", "query", "path", "header", "cookie"}

log = logging.getLogger(__name__)


class ApiError(Exception):
	"""Erro que vira o envelope de auth.md §2.5. É o que as rotas de todas as Slices levantam."""

	def __init__(self, status_code: int, code: str, message: str = "",
			fields: Mapping[str, str] | None = None, headers: Mapping[str, str] | None = None) -> None:
		super().__init__(message or code)
		self.status_code = status_code
		self.code = code
		self.message = message or code
		self.fields = dict(fields) if fields is not None else None
		self.headers = dict(headers) if headers is not None else None


def error_response(request: Request, status_code: int, code: str, message: str,
		fields: Mapping[str, str] | None = None, headers: Mapping[str, str] | None = None) -> JSONResponse:
	request_id = get_request_id(request)
	error: dict[str, Any] = {"code": code, "message": message, "request_id": request_id}
	if fields is not None:
		error["fields"] = dict(fields)
	# o 500 sai por fora do RequestIdMiddleware, então o cabeçalho vai daqui também
	all_headers = {**(headers or {}), HEADER: request_id}
	return JSONResponse({"error": error}, status_code=status_code, headers=all_headers)


def field_name(loc: Sequence[int | str]) -> str | None:
	# ("body", "pickups", "mana") → "pickups.mana"; ("body",) é o corpo inteiro, sem campo
	parts = [str(part) for part in loc]
	if parts and parts[0] in LOCATIONS:
		parts = parts[1:]
	return ".".join(parts) or None


def field_code(error_type: str) -> str:
	if error_type in FIELD_CODES:
		return error_type
	return PYDANTIC_TO_FIELD_CODE.get(error_type, "invalid_value")


def validation_fields(errors: Sequence[Mapping[str, Any]]) -> dict[str, str]:
	fields: dict[str, str] = {}
	for error in errors:
		name = field_name(error.get("loc", ()))
		if name is not None and name not in fields: # um code por campo: vale o primeiro
			fields[name] = field_code(error.get("type", ""))
	return fields


async def handle_api_error(request: Request, exc: ApiError) -> JSONResponse:
	return error_response(request, exc.status_code, exc.code, exc.message, exc.fields, exc.headers)


async def handle_validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
	fields = validation_fields(exc.errors())
	return error_response(request, 422, "validation_error", "request validation failed", fields)


async def handle_http_exception(request: Request, exc: StarletteHTTPException) -> JSONResponse:
	default = "internal_error" if exc.status_code >= 500 else "validation_error"
	code = STATUS_TO_CODE.get(exc.status_code, default)
	message = exc.detail if isinstance(exc.detail, str) else code
	return error_response(request, exc.status_code, code, message, headers=exc.headers)


async def handle_unexpected_error(request: Request, exc: Exception) -> JSONResponse:
	# sem stack no corpo. O traceback vai para o log daqui, com o request_id: este handler roda fora
	# do RequestIdMiddleware, e o traceback que o uvicorn grava depois já não tem o id
	request_id = get_request_id(request)
	log.error("unhandled error", exc_info=exc,
		extra={"request_id": request_id, "method": request.method, "path": request.url.path})
	return error_response(request, 500, "internal_error", "internal server error")


def install_error_handlers(app: FastAPI) -> None:
	app.add_exception_handler(ApiError, handle_api_error)
	app.add_exception_handler(RequestValidationError, handle_validation_error)
	app.add_exception_handler(StarletteHTTPException, handle_http_exception)
	app.add_exception_handler(Exception, handle_unexpected_error)
