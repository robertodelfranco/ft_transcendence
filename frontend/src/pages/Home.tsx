import { useTranslation } from "react-i18next";
import { usePageTitle } from "../hooks/usePageTitle";

export default function Home() {
	const { t } = useTranslation();
	usePageTitle();

	return (
		<section>
			<h1 className="text-3xl font-bold text-torch">{t("app.name")}</h1>
			<p className="mt-4 max-w-prose">{t("home.tagline")}</p>
		</section>
	);
}