import { describe, expect, it } from "vitest";
import { ERROR_CODES, FIELD_ERROR_CODES } from "../i18n/errorCodes";
import { LANGUAGES } from "../i18n/languages";
import { LEGAL_PAGES } from "../i18n/legal";

type Json = { [key: string]: string | Json };

// Carrega ./<idioma>/<namespace>.json; um namespace novo entra no teste sozinho
const files = import.meta.glob<Json>("./*/*.json", { eager: true, import: "default" });

const catalog: Record<string, Record<string, Json>> = {};
for (const [path, content] of Object.entries(files)) {
  const [, language, file] = path.split("/");
  (catalog[language] ??= {})[file.replace(".json", "")] = content;
}

function flatten(json: Json, prefix = ""): Record<string, string> {
  return Object.entries(json).reduce<Record<string, string>>((acc, [key, value]) => {
    if (typeof value === "string") acc[prefix + key] = value;
    else Object.assign(acc, flatten(value, `${prefix}${key}.`));
    return acc;
  }, {});
}

const variables = (text: string) => [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();

describe("locales", () => {
  it("existem os três idiomas", () => {
    expect(Object.keys(catalog).sort()).toEqual([...LANGUAGES].sort());
  });

  const namespaces = Object.keys(catalog.en);

  it.each(LANGUAGES)("%s tem os mesmos namespaces do en", (language) => {
    expect(Object.keys(catalog[language]).sort()).toEqual([...namespaces].sort());
  });

  describe.each(namespaces)("namespace %s", (namespace) => {
    const reference = flatten(catalog.en[namespace]);

    it.each(LANGUAGES)("%s tem as mesmas chaves do en, sem texto vazio", (language) => {
      const current = flatten(catalog[language][namespace]);
      expect(Object.keys(current).sort()).toEqual(Object.keys(reference).sort());
      expect(Object.values(current).every((text) => text.trim() !== "")).toBe(true);
    });

    it.each(LANGUAGES)("%s usa as mesmas variáveis {{...}} do en", (language) => {
      const current = flatten(catalog[language][namespace]);
      for (const key of Object.keys(reference)) {
        expect(variables(current[key]), key).toEqual(variables(reference[key]));
      }
    });
  });
});

describe("errors", () => {
  it.each(LANGUAGES)("%s traduz todo code do i18n.md §2.3", (language) => {
    const errors = flatten(catalog[language].errors);
    for (const code of ERROR_CODES) expect(errors[code], code).toBeTruthy();
    for (const code of FIELD_ERROR_CODES) expect(errors[`fields.${code}`], code).toBeTruthy();
    expect(errors.unknownWithRef).toContain("{{requestId}}");
  });
});

// i18n.md §2.4: lidos direto do disco, porque o fallback para o en esconderia um arquivo faltando
const legal = import.meta.glob<string>("./legal/*/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
});

describe("textos legais", () => {
  it("tem privacy.md e terms.md em cada idioma, e nada além", () => {
    const expected = LANGUAGES.flatMap((language) =>
      LEGAL_PAGES.map((page) => `./legal/${language}/${page}.md`),
    );
    expect(Object.keys(legal).sort()).toEqual(expected.sort());
  });

  it.each(Object.entries(legal))("%s tem texto e começa nos títulos ##", (_path, text) => {
    expect(text.trim()).not.toBe("");
    // o h1 é o título da página (common:footer.*); um # no Markdown viraria um segundo h1
    expect(text).not.toMatch(/^# /m);
  });
});
