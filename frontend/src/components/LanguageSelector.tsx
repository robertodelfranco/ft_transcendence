import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../auth/AuthContext";
import { changeLanguage } from "../i18n";
import { isLanguage, LANGUAGES, type Language } from "../i18n/languages";
import ErrorNotice, { toFailure, type Failure } from "./ErrorNotice";

export default function LanguageSelector() {
  const { t, i18n } = useTranslation();
  const { status, updateProfile } = useAuth();
  const [failure, setFailure] = useState<Failure | null>(null);

  // A tela troca na hora; com sessão, o perfil guarda a escolha (i18n.md §2.1). Se o PATCH
  // falhar, a troca continua valendo e o erro aparece traduzido, nunca no console
  function select(language: Language) {
    changeLanguage(language);
    setFailure(null);
    if (status === "authenticated")
      updateProfile({ preferred_language: language })
        .catch((error: unknown) => setFailure(toFailure(error)));
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <label className="flex items-center gap-2 text-sm">
        <span>{t("language.label")}</span>
        <select 
          value={i18n.resolvedLanguage}
          onChange={(e) => {
            if (isLanguage(e.target.value)) select(e.target.value);
          }}
          className="rounded border border-crypt-700 bg-crypt-900 px-2 py-1 text-bone focus-visible:outline-2 focus-visible:outline-torch"
        >
          {LANGUAGES.map((language) => (
            <option key={language} value={language}>
              {t(`language.names.${language}`)}
            </option>
          ))}
        </select>
      </label>
      {failure && <ErrorNotice failure={failure} />}
    </div>
  );
}
