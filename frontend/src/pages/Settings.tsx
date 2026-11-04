import { useTranslation } from "react-i18next";
import { usePageTitle } from "../hooks/usePageTitle";

// Edição do próprio perfil (i18n.md §3). O conteúdo entra no passo 3
export default function Settings() {
  const { t } = useTranslation("profile");
  usePageTitle("profile:settings.title");

  return <h1 className="text-2xl font-bold text-torch">{t("settings.title")}</h1>;
}
