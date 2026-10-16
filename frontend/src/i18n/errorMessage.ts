import type { TFunction } from "i18next";
import { ERROR_CODES, FIELD_ERROR_CODES, type FieldErrorCode } from "./errorCodes";;

type ErrorCode = (typeof ERROR_CODES)[number];

function isErrorCode(code: string): code is ErrorCode {
  return (ERROR_CODES as readonly string[]). includes(code);
}

// Um code de campo fora da lista ainda é erro naquele campo, só que sem detalhe
export function toFieldErrorCode(code: string): FieldErrorCode {
  return (FIELD_ERROR_CODES as readonly string[]).includes(code)
    ? (code as FieldErrorCode)
    : "invalid_value";
}

// i18n.md §2.3: code fora da lista nunca vira chave crua na tela
export function errorMessage(t: TFunction, code: string, requestId: string | null = null): string {
  if (isErrorCode(code))
    return t(`errors:${code}`);
  return requestId ? t("erros:unknownWithRef", { requestId }) : t("errors.unknown");
}