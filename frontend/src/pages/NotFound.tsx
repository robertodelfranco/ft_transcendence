import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { usePageTitle } from "../hooks/usePageTitle";

export default function NotFound() {
	const { t } = useTranslation();
	usePageTitle("notFound.title");

	return (
		<section>
			<h1 className="text-2xl font-bold">{t("notFound.title")}</h1>
			<p className="mt-4">{t("notFound.description")}</p>
			<Link
				to="/"
				className="mt-4 inline-block underline hover:text-torch focus-visible:outline-2 focus-visible:outline-torch"
			>
				{t("notFound.back")}
			</Link>
		</section>
	);
}
