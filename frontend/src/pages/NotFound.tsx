import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import Icon from "../components/Icon";
import { linkClass } from "../components/styles";
import { usePageTitle } from "../hooks/usePageTitle";

export default function NotFound() {
  const { t } = useTranslation();
  usePageTitle("notFound.title");

  return (
    <section className="flex flex-col items-start">
      <Icon name="skull" className="mb-4 h-16! w-16! text-torch/80" />
      <h1 className="text-2xl font-bold">{t("notFound.title")}</h1>
      <p className="mt-4">{t("notFound.description")}</p>
      <Link
        to="/"
        className={`mt-4 inline-block ${linkClass}`}
      >
        {t("notFound.back")}
      </Link>
    </section>
  );
}
