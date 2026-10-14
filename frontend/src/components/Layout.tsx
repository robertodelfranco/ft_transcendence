import { useTranslation } from "react-i18next";
import { Link, Outlet } from "react-router";
import LanguageSelector from "./LanguageSelector";

const linkClass = "underline hover:text-torch focus-visible:outline-2 focus-visible:outline-torch";

export default function Layout() {
	const { t } = useTranslation();

	return (
		<div className="flex min-h-screen flex-col bg-crypt-950 text-bone">
			<header className="flex flex-wrap items-center justify-between gap-2 border-b border-crypt-700 px-4 py-3">
				<Link
					to="/"
					className="text-lg font-bold text-torch focus-visible:outline-2 focus-visible:outline-torch"
				>
					{t("app.name")}
				</Link>
				<LanguageSelector />
			</header>

			<main className="flex-1 px-4 py-8">
				<Outlet />
			</main>

			<footer className="border-t border-crypt-700 px-4 py-4">
				<nav aria-label={t("footer.navLabel")} className="flex gap-4 text-sm">
					<Link to="/privacy" className={linkClass}>
						{t("footer.privacy")}
					</Link>
					<Link to="/terms" className={linkClass}>
						{t("footer.terms")}
					</Link>
				</nav>
			</footer>
		</div>
	);
}
