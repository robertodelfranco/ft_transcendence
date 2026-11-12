import { FALLBACK_LANGUAGE } from "./languages";
import type { LegalPage } from "./legalPages";

// O Vite traz cada locales/legal/<idioma>/<página>.md como texto (?raw), já dentro do bundle.
// Quem importa este arquivo leva os seis textos junto: só a página legal (chunk próprio) importa
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
