import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import Icon from "../components/Icon";
import { linkClass } from "../components/styles";
import { usePageTitle } from "../hooks/usePageTitle";

// Botão de destaque: preenchimento torch, com um anel escuro e outro claro por fora (box-shadow,
// e não outline, que o foco já usa). O foco visível vem mais afastado, para não cair sobre o anel
const heroButton = "mt-4 inline-flex items-center gap-2 bg-torch px-10 py-3 font-heading font-bold uppercase tracking-wider "
  + "text-crypt-950 shadow-[0_0_0_2px_var(--color-crypt-950),0_0_0_3px_var(--color-bone)] "
  + "hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-4 "
  + "focus-visible:outline-torch";

export default function Home() {
  const { t } = useTranslation();
  usePageTitle();

  return (
    // largura total: o -mx-4 -my-8 cancela o px-4 py-8 do <main> do Layout
    <section className="home-hero relative -mx-4 -my-8 flex min-h-[calc(100dvh-7.5rem)] flex-col items-center justify-center overflow-hidden px-4 py-16 text-center">
      {/* fundo, só decoração: a parede do jogo ampliada some no centro, onde está o texto; um brilho
          de tocha atrás do título; e a base escurece até a cor da página */}
      <div
        aria-hidden
        className="absolute inset-0 bg-[url(/assets/map/dungeon_wall_1.png)] bg-[length:256px] opacity-25 [image-rendering:pixelated] [mask-image:radial-gradient(ellipse_at_50%_45%,transparent_15%,black_75%)]"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_40%,rgb(255_138_31/0.2),transparent_40%)]"
      />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-crypt-950" />

      <div className="relative flex max-w-4xl flex-col items-center gap-6">
        <h1 className="font-display text-6xl tracking-wide text-[#ffb066] drop-shadow-[0_0_24px_rgb(255_138_31/0.45)] sm:text-7xl md:text-8xl lg:text-9xl">
          {t("app.name")}
        </h1>
        <p className="max-w-xl text-balance font-heading text-base font-semibold uppercase tracking-wider text-bone sm:text-xl">
          {t("home.tagline")}
        </p>
        <Link to="/signup" className={heroButton}><Icon name="scroll" />{t("home.signup")}</Link>
        <Link to="/login" className={`inline-flex items-center gap-1.5 ${linkClass}`}><Icon name="key" />{t("home.login")}</Link>
      </div>
    </section>
  );
}