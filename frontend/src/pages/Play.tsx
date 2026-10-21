import { useTranslation } from "react-i18next";
import { useParams } from "react-router";
import { usePageTitle } from "../hooks/usePageTitle";

// Provisória: só dá destino ao match_started. A F7.6 (#49) troca por mountGame e a HUD
export default function Play() {
  const { t } = useTranslation("hud");
  const { matchId } = useParams();
  usePageTitle("hud:title");

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold text-torch">{t("title")}</h1>
      <p role="status">{t("connecting", { matchId })}</p>
    </section>
  );
}
