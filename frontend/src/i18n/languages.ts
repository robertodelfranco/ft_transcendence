export const LANGUAGES = ["pt-BR", "en", "es"] as const;
export type Language = (typeof LANGUAGES)[number];

export const FALLBACK_LANGUAGE: Language = "en";

const STORAGE_KEY = "lang";

export function isLanguage(value: unknown): value is Language {
	return LANGUAGES.some((language) => language === value);
}

// "pt-PT" -> "pt-BR", "es-MX" -> "es", "en-GB" -> "en", "fr" -> undefined
export function matchLanguage(tag: string): Language | undefined {
	const base = tag.toLowerCase().split("-")[0];
	if (base === 'pt') return "pt-BR";
	if (base === 'en') return "en";
	if (base === 'es') return "es";
	return (undefined);
}

export function readStoredLanguage(): Language | undefined {
	try {
		const value = localStorage.getItem(STORAGE_KEY);
		return isLanguage(value) ? value : undefined;
	} catch {
		return undefined;
	}
}

export function storeLanguage(language: Language): void {
	try {
		localStorage.setItem(STORAGE_KEY, language);
	} catch {
		// localStorage pode estar bloqueado (janela privada): a troca na tela continua valendo;
	}
}

// Ordem do i18n.md §2.1 (o passo do perfil entra com o F7.1):
// escolha salva > navigator.languages > en
export function detectLanguage(
	stored: Language | undefined = readStoredLanguage(),
	navigatorLanguages: readonly string[] = navigator.languages,
): Language {
	if (stored)
		return stored;
	for (const tag of navigatorLanguages) {
		const match = matchLanguage(tag);
		if (match)
			return match;
	}
	return FALLBACK_LANGUAGE;
}