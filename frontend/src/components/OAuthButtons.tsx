import { useTranslation } from "react-i18next";
import { FALLBACK_LANGUAGE, isLanguage } from "../i18n/languages";

// Só a 42 por enquanto (reunião de 19/10): o Google volta com a F6.8 parte 2 (#164), com
// { id: "google", label: "oauth.withGoogle" }; a tradução já está nos três idiomas
const PROVIDERS = [{ id: "42", label: "oauth.with42" }] as const;

const linkClass = "rounded border border-crypt-700 px-4 py-2 text-center hover:text-torch focus-visible:outline-2 focus-visible:outline-torch";

// Links comuns, não <Link>: o backend responde 302 para fora do site, e nenhum script de
// provedor entra na página (auth.md §2.8)
export default function OAuthButtons() {
  const { t, i18n } = useTranslation("auth");
  const lang = isLanguage(i18n.resolvedLanguage) ? i18n.resolvedLanguage : FALLBACK_LANGUAGE;
  const query = new URLSearchParams({ lang });

  return (
    <div className="flex flex-col gap-3">
      <p className="text-center text-sm">{t("oauth.or")}</p>
      {PROVIDERS.map(({ id, label }) => (
        <a key={id} href={`/api/auth/oauth/${id}/login?${query}`} className={linkClass}>
          {t(label)}
        </a>
      ))}
    </div>
  );
}