import { useTranslation } from "react-i18next";
import { usePageTitle } from "../hooks/usePageTitle";

// Perfil de um User, próprio ou de terceiros (i18n.md §3). O conteúdo entra no passo 2
export default function UserProfile() {
  const { t } = useTranslation("profile");
  usePageTitle("profile:user.title");

  return <h1 className="text-2xl font-bold text-torch">{t("user.title")}</h1>;
}
