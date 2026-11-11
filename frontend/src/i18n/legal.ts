import { FALLBACK_LANGUAGE } from "./languages";

export const LEGAL_PAGES = ["privacy", "terms"] as const;
export type LegalPage = (typeof LEGAL_PAGES)[number];

// O Vite traz cada locales/legal/<idioma>/<página>.md como texto (?raw), já dentro do bundle
const texts = import.meta.glob<string>("../locales/legal/*/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
});

// i18n.md §2.4: idioma sem o arquivo cai no en
export function legalText(page: LegalPage, language: string | undefined): string {
  const path = (lang: string) => `../locales/legal/${lang}/${page}.md`;
  return texts[path(language ?? FALLBACK_LANGUAGE)] ?? texts[path(FALLBACK_LANGUAGE)];
}
