import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import commonPtBR from "../locales/pt-BR/common.json";
import errorsPtBR from "../locales/pt-BR/errors.json";
import commonEn from "../locales/en/common.json";
import errorsEn from "../locales/en/errors.json";
import commonEs from "../locales/es/common.json";
import errorsEs from "../locales/es/errors.json";
import {
	FALLBACK_LANGUAGE,
	LANGUAGES,
	detectLanguage,
	storeLanguage,
	type Language,
} from "./languages";

const resources = {
	"pt-BR": { common: commonPtBR, errors: errorsPtBR },
	en: { common: commonEn, errors: errorsEn },
	es: { common: commonEs, errors: errorsEs },
};

// <html lang> acompanha o idioma atual (leitor de tela e hifenização dependem dele)
i18n.on("languageChanged", (language) => {
	document.documentElement.lang = language;
});

void i18n.use(initReactI18next).init({
	resources,
	lng: detectLanguage(),
	fallbackLng: FALLBACK_LANGUAGE,
	supportedLngs: LANGUAGES,
	defaultNS: "common",
	interpolation: { escapeValue: false }, // o React já escapa
	debug: false, // console limpo (i18n.md §2.5)
});

// Chamada pelo seletor: troca na hora e lembra a escolha. 
// O PATCH no perfil entra com o F7.1.
export function changeLanguage(language: Language): void {
	storeLanguage(language);
	void i18n.changeLanguage(language);
}

export default i18n;