import type { TFunction } from "i18next";
import { ERROR_CODES, FIELD_ERROR_CODES, type FieldErrorCode } from "./errorCodes";

type ErrorCode = (typeof ERROR_CODES)[number];

function isErrorCode(code: string): code is ErrorCode {
  return (ERROR_CODES as readonly string[]).includes(code);
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
  return requestId ? t("errors:unknownWithRef", { requestId }) : t("errors:unknown");
}

// O que pode aparecer junto de um campo: o code do 422 ou um conflito do 409 (auth.md §2.2)
export type FieldError = FieldErrorCode | "email_taken" | "username_taken";

export function fieldErrorMessage(t: TFunction, error: FieldError): string {
  return error === "email_taken" || error === "username_taken"
    ? t(`errors:${error}`)
    : t(`errors:fields.${error}`);
}
