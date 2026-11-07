import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { linkClass } from "../components/styles";
import { usePageTitle } from "../hooks/usePageTitle";

// Botão de destaque: preenchimento torch, com um anel escuro e outro claro por fora (box-shadow,
// e não outline, que o foco já usa). O foco visível vem mais afastado, para não cair sobre o anel
const heroButton = "mt-4 inline-block bg-torch px-10 py-3 font-bold uppercase tracking-wider "
  + "text-crypt-950 shadow-[0_0_0_2px_var(--color-crypt-950),0_0_0_3px_var(--color-bone)] "
  + "hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-4 "
  + "focus-visible:outline-torch";

export default function Home() {
  const { t } = useTranslation();
  usePageTitle();

  return (
    // largura total: o -mx-4 -my-8 cancela o px-4 py-8 do <main> do Layout
    <section className="relative -mx-4 -my-8 flex min-h-[calc(100dvh-7.5rem)] flex-col items-center justify-center overflow-hidden px-4 py-16 text-center">
      {/* fundo, só decoração: a parede do jogo ampliada some no centro, onde está o texto; um brilho
          de tocha atrás do título; e a base escurece até a cor da página */}
      <div
        aria-hidden
        className="absolute inset-0 bg-[url(/assets/map/dungeon_wall_1.png)] bg-[length:256px] opacity-25 [image-rendering:pixelated] [mask-image:radial-gradient(ellipse_at_50%_45%,transparent_15%,black_75%)]"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_40%,rgb(242_160_61/0.22),transparent_40%)]"
      />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-crypt-950" />

      <div className="relative flex max-w-4xl flex-col items-center gap-6">
        <h1 className="font-serif text-4xl font-bold uppercase tracking-wider text-torch drop-shadow-[0_0_24px_rgb(242_160_61/0.45)] sm:text-5xl md:text-6xl lg:text-7xl lg:tracking-widest">
          {t("app.name")}
        </h1>
        <p className="max-w-xl text-balance text-base font-bold uppercase tracking-wide text-bone sm:text-xl">
          {t("home.tagline")}
        </p>
        <Link to="/signup" className={heroButton}>{t("home.signup")}</Link>
        <Link to="/login" className={linkClass}>{t("home.login")}</Link>
      </div>
    </section>
  );
}