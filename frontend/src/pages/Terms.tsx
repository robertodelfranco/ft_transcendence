import { useTranslation } from "react-i18next";
import { usePageTitle } from "../hooks/usePageTitle";

export default function Terms() {
  const { t } = useTranslation();
  usePageTitle("footer.terms");

  return (
    <section>
      <h1 className="text-2xl font-bold">{t("footer.terms")}</h1>
    </section>
  );
}