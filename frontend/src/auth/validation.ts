import type { FieldErrorCode } from "../i18n/errorCodes";

// Regras de auth.md §2.4, as mesmas do backend (app/auth/schemas.py). Cada função devolve o
// `code` que o 422 traria em `fields` para aquele campo, ou null quando o valor passa
export const MAX_EMAIL_LENGTH = 254;
export const MIN_USERNAME_LENGTH = 3;
export const MAX_USERNAME_LENGTH = 20;
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

// Só o formato grosso. Quem decide é o email-validator do backend: uma regra mais rígida aqui
// recusaria e-mail que o backend aceita
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_CHARS = /^[a-z0-9_]+$/;
const LETTER = /\p{L}/u; // o mesmo que o isalpha() do Python: "ç" e "ã" contam
const DIGIT = /\d/; // só 0-9

// O Python conta caracteres; o .length do JS conta unidades UTF-16, e "😀" valeria 2
function length(value: string): number {
  return [...value].length;
}

// " Ana@X.com " é o mesmo e-mail que "ana@x.com"
export function normalize(value: string): string {
  return value.trim().toLowerCase();
}

// A ordem segue a do Pydantic: tamanho antes do formato
export function validateEmail(raw: string): FieldErrorCode | null {
  const email = normalize(raw);
  if (!email)
    return "required";
  if (length(email) > MAX_EMAIL_LENGTH)
    return "too_long";
  if (!EMAIL_SHAPE.test(email))
    return "invalid_format";
  return null;
}

export function validateUsername(raw: string): FieldErrorCode | null {
  const username = normalize(raw);
  if (!username)
    return "required";
  if (length(username) < MIN_USERNAME_LENGTH)
    return "too_short";
  if (length(username) > MAX_USERNAME_LENGTH)
    return "too_long";
  if (!USERNAME_CHARS.test(username))
    return "invalid_format";
  return null;
}

// Senha sem normalização: espaço conta
export function validateNewPassword(password: string): FieldErrorCode | null {
  if (!password)
    return "required";
  if (length(password) < MIN_PASSWORD_LENGTH)
    return "too_short";
  if (length(password) > MAX_PASSWORD_LENGTH)
    return "too_long";
  if (!LETTER.test(password) || !DIGIT.test(password))
    return "weak_password";
  return null;
}

// No login, só o teto: dizer "senha fraca" revelaria a regra a quem testa senhas
export function validateLoginPassword(password: string): FieldErrorCode | null {
  if (!password)
    return "required";
  if (length(password) > MAX_PASSWORD_LENGTH)
    return "too_long";
  return null;
}
