import { useTranslation } from "react-i18next";
import LanguageSelector from "../components/LanguageSelector";
import { usePageTitle } from "../hooks/usePageTitle";
import AvatarForm from "../profile/AvatarForm";
import UsernameForm from "../profile/UsernameForm";

// /settings (i18n.md §3): avatar, username e idioma
export default function Settings() {
  const { t } = useTranslation("profile");
  usePageTitle("profile:settings.title");

  return (
    <section className="mx-auto flex w-full max-w-md flex-col gap-8">
      <h1 className="text-2xl font-bold text-torch">{t("settings.title")}</h1>
      <AvatarForm />
      <UsernameForm />
      {/* o mesmo seletor do cabeçalho, que grava no perfil; o flex o deixa à esquerda */}
      <div className="flex">
        <LanguageSelector />
      </div>
    </section>
  );
}
