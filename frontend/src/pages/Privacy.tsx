import { useTranslation } from "react-i18next";
import { usePageTitle } from "../hooks/usePageTitle";

export default function Privacy() {
	const { t } = useTranslation();
	usePageTitle("footer.privacy");

	return <h1 className="text-2xl font-bold">{t("footer.privacy")}</h1>
}