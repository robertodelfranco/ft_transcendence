import Markdown, { type Components } from "react-markdown";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { linkClass } from "../components/styles";
import { usePageTitle } from "../hooks/usePageTitle";
import { legalText } from "../i18n/legal";
import type { LegalPage } from "../i18n/legalPages";

// O Tailwind zera o estilo de títulos e listas, então cada elemento do Markdown recebe as classes
// aqui. Só `children` passa adiante: o react-markdown também manda `node`, que não é atributo HTML
const components: Components = {
  h2: ({ children }) => <h2 className="mt-8 mb-3 text-xl font-bold">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-6 mb-2 text-lg font-bold">{children}</h3>,
  p: ({ children }) => <p className="mb-3 leading-relaxed">{children}</p>,
  ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-6">{children}</ul>,
  ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-6">{children}</ol>,
  code: ({ children }) => <code className="rounded bg-crypt-900 px-1 text-sm">{children}</code>,
  // link do próprio site ("/privacy") passa pelo router, sem recarregar a página; o resto é <a>
  a: ({ href = "", children }) =>
    href.startsWith("/")
      ? <Link to={href} className={linkClass}>{children}</Link>
      : <a href={href} className={linkClass}>{children}</a>,
};

// /privacy e /terms: o título vem do common (o mesmo do rodapé), o corpo vem do Markdown do idioma
export default function Legal({ page }: { page: LegalPage }) {
  const { t, i18n } = useTranslation();
  usePageTitle(`footer.${page}`);

  return (
    <article className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold text-torch">{t(`footer.${page}`)}</h1>
      <Markdown components={components}>{legalText(page, i18n.resolvedLanguage)}</Markdown>
    </article>
  );
}
