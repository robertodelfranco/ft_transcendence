import { useTranslation } from "react-i18next";
import { useAuth } from "../auth/AuthContext";
import { usePageTitle } from "../hooks/usePageTitle";

export default function Lobby() {
	const { t } = useTranslation();
	const { user } = useAuth();
	usePageTitle("lobby.title");

	return (
		<section>
			<h1 className="text-2xl font-bold">{t("lobby.greeting", { username: user?.username })}</h1>
		</section>
	);
}