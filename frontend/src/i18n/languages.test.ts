import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { detectLanguage, matchLanguage, readStoredLanguage } from "./languages";

describe("matchLanguage", () => {
  it.each([
    ["pt", "pt-BR"],
    ["pt-PT", "pt-BR"],
    ["pt-BR", "pt-BR"],
    ["es-MX", "es"],
    ["en-GB", "en"],
    ["EN-us", "en"],
  ])("%s vira %s", (tag, expected) => {
    expect(matchLanguage(tag)).toBe(expected);
  });

  it("não casa idioma fora dos três", () => {
    expect(matchLanguage("fr-FR")).toBeUndefined();
  });
});

describe("detectLanguage", () => {
  it("a escolha salva vence o navegador", () => {
    expect(detectLanguage("es", ["pt-BR"])).toBe("es");
  });

  it("usa o primeiro idioma do navegador que casa", () => {
    expect(detectLanguage(undefined, ["fr-FR", "es-AR", "en"])).toBe("es");
  });

  it("cai em en quando nada casa", () => {
    expect(detectLanguage(undefined, ["fr", "de"])).toBe("en");
    expect(detectLanguage(undefined, [])).toBe("en");
  });
});

describe("readStoredLanguage", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("lê um idioma válido", () => {
    localStorage.setItem("lang", "es");
    expect(readStoredLanguage()).toBe("es");
  });

  it("ignora valor que não é um dos três", () => {
    localStorage.setItem("lang", "pt");
    expect(readStoredLanguage()).toBeUndefined();
  });

  it("não quebra quando o localStorage está bloqueado", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readStoredLanguage()).toBeUndefined();
  });
});