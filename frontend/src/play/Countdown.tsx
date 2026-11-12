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
            <p className="rounded bg-crypt-950/85 px-4 py-2 text-lg text-bone">{t("countdown.waiting")}</p>
          ) : (
            <p className="text-8xl font-bold text-white drop-shadow-[0_0_12px_rgb(0_0_0/0.8)]">{countdown}</p>
          )}
        </div>
      )}
    </>
  );
}
