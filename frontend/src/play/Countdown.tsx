import { useTranslation } from "react-i18next";
import type { HudState } from "../../game/src/index";

// Contagem do início da partida (#255): a Room nasce congelada, espera os Players e conta 3, 2, 1.
// Fica sobre o canvas, em React, porque o canvas do jogo não tem texto (hud.md §2). Some quando a
// partida passa a valer.
export default function Countdown({ countdown }: { countdown: HudState["countdown"] }) {
  const { t } = useTranslation("hud");
  const announcement = countdown === null ? ""
    : countdown === "waiting" ? t("countdown.waiting") : t("countdown.startsIn", { seconds: countdown });

  return (
    <>
      {/* a região de status fica sempre montada, para o leitor de tela anunciar cada número */}
      <p role="status" className="sr-only">{announcement}</p>
      {countdown !== null && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-center justify-center rounded bg-black/50"
        >
          {countdown === "waiting" ? (
            <p className="hud-frame font-game text-lg text-[#efdbb5]">{t("countdown.waiting")}</p>
          ) : (
            <p className="font-game text-8xl font-bold text-torch [text-shadow:0_4px_0_#000,0_0_24px_rgb(242_160_61/0.55)]">{countdown}</p>
          )}
        </div>
      )}
    </>
  );
}
