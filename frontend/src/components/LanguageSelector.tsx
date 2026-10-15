import { useTranslation } from "react-i18next";
import { changeLanguage } from "../i18n";
import { isLanguage, LANGUAGES } from "../i18n/languages";

export default function LanguageSelector() {
  const { t, i18n } = useTranslation();

  return (
    <label className="flex items-center gap-2 text-sm">
      <span>{t("language.label")}</span>
      <select 
        value={i18n.resolvedLanguage}
        onChange={(e) => {
          if (isLanguage(e.target.value)) changeLanguage(e.target.value);
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
  );
}