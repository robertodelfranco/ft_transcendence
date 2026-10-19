import { describe, expect, it } from "vitest";
import type { FieldErrorCode } from "../i18n/errorCodes";
import {
	normalize, validateEmail, validateLoginPassword, validateNewPassword, validateUsername,
} from "./validation";

type Case = [input: string, expected: FieldErrorCode | null];

// "@X.com" tem 6 caracteres: 248 + 6 = 254, o teto
const EMAIL_AT_LIMIT = `${"a".repeat(248)}@x.com`;

describe("normalize", () => {
  it("tira espaço das pontas e passa para minúsculas", () => {
    expect(normalize("  Ana@X.com ")).toBe("ana@x.com");
  });
});

describe("validateEmail", () => {
  it.each<Case>([
    ["", "required"],
    ["   ", "required"],
    ["ana", "invalid_format"],
    ["ana@x", "invalid_format"],
    ["ana maria@x.com", "invalid_format"],
    [EMAIL_AT_LIMIT, null],
    [`a${EMAIL_AT_LIMIT}`, "too_long"],
    ["ana@x.com", null],
    ["  Ana@X.com", null],
  ])("%j → %s", (input, expected) => {
    expect(validateEmail(input)).toBe(expected);
  });
});

describe("validateUsername", () => {
  it.each<Case>([
    ["", "required"],
    ["ab", "too_short"],
    ["a!", "too_short"],
    ["abc", null],
    ["a".repeat(20), null],
    ["a".repeat(21), "too_long"],
    ["ana!", "invalid_format"],
    ["joão", "invalid_format"],
    ["ana maria", "invalid_format"],
    ["  Ana_42", null],
  ])("%j → %s", (input, expected) => {
    expect(validateUsername(input)).toBe(expected);
  });
});

describe("validateNewPassword", () => {
  it.each<Case>([
    ["", "required"],
    ["abc1234", "too_short"],
    ["😀😀😀a1", "too_short"], // 5 caracteres, embora o .length dê 8
    ["abcd1234", null],
    ["a1".repeat(64), null],
    [`${"a1".repeat(64)}x`, "too_long"],
    ["abcdefgh", "weak_password"],
    ["12345678", "weak_password"],
    ["        ", "weak_password"], // espaço conta no tamanho, mas não é letra
    ["ação1234", null],
    ["senha١٢٣٤", "weak_password"], // dígito arábico não é 0-9
  ])("%j → %s", (input, expected) => {
    expect(validateNewPassword(input)).toBe(expected);
  });
});

describe("validateLoginPassword", () => {
  it.each<Case>([
    ["", "required"],
    ["x", null],
    ["abcdefgh", null], // senha "fraca" passa: o login não revela a regra
    ["a".repeat(128), null],
    ["a".repeat(129), "too_long"],
  ])("%j → %s", (input, expected) => {
    expect(validateLoginPassword(input)).toBe(expected);
  });
});
