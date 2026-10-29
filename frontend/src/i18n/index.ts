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

import authPtBR from "../locales/pt-BR/auth.json";
import authEn from "../locales/en/auth.json";
import authEs from "../locales/es/auth.json";
import gamePtBR from "../locales/pt-BR/game.json";
import gameEn from "../locales/en/game.json";
import gameEs from "../locales/es/game.json";
import hudPtBR from "../locales/pt-BR/hud.json";
import hudEn from "../locales/en/hud.json";
import hudEs from "../locales/es/hud.json";
import lobbyPtBR from "../locales/pt-BR/lobby.json";
import lobbyEn from "../locales/en/lobby.json";
import lobbyEs from "../locales/es/lobby.json";

const resources = {
  "pt-BR": {
    auth: authPtBR, common: commonPtBR, errors: errorsPtBR,
    game: gamePtBR, hud: hudPtBR, lobby: lobbyPtBR,
  },
  en: { auth: authEn, common: commonEn, errors: errorsEn, game: gameEn, hud: hudEn, lobby: lobbyEn },
  es: { auth: authEs, common: commonEs, errors: errorsEs, game: gameEs, hud: hudEs, lobby: lobbyEs },
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

// Chamada pelo seletor e pelo AuthContext: troca na hora e lembra a escolha no navegador.
// Gravar no perfil é do LanguageSelector, que sabe se há sessão
export function changeLanguage(language: Language): void {
  storeLanguage(language);
  void i18n.changeLanguage(language);
}

export default i18n;
