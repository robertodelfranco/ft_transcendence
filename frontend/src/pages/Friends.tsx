import { useTranslation } from "react-i18next";
import { usePageTitle } from "../hooks/usePageTitle";

// Amigos com presença e busca (i18n.md §3). O conteúdo entra no passo 4
export default function Friends() {
  const { t } = useTranslation("profile");
  usePageTitle("profile:friends.title");

  return <h1 className="text-2xl font-bold text-torch">{t("friends.title")}</h1>;
}
