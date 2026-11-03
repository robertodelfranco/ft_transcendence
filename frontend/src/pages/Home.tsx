import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { buttonPrimary, buttonSecondary } from "../components/styles";
import { usePageTitle } from "../hooks/usePageTitle";

export default function Home() {
  const { t } = useTranslation();
  usePageTitle();

  return (
    <section>
      <h1 className="text-3xl font-bold text-torch">{t("app.name")}</h1>
      <p className="mt-4 max-w-prose">{t("home.tagline")}</p>
      <div className="mt-8 flex flex-wrap gap-4">
        <Link to="/login" className={buttonPrimary}>{t("home.login")}</Link>
        <Link to="/signup" className={buttonSecondary}>{t("home.signup")}</Link>
      </div>
    </section>
  );
}