import { useEffect } from "react";
import { useTranslation } from "react-i18next";

// Sem `pageKey`, o título é só o nome do app. Muda junto com o idioma.
export function usePageTitle(pageKey?: string): void {
	const { t } = useTranslation();
	const app = t("app.name");
	const title = pageKey ? t("titles.withApp", { page: t(pageKey), app }) : app;

	useEffect(() => {
		document.title = title;
	}, [title]);
}
