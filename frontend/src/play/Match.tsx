import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import type { EndResult, HudState, MountedGame } from "../../game/src/index";
import { useAuth } from "../auth/AuthContext";
import ErrorNotice from "../components/ErrorNotice";
import { buttonSecondary, linkClass } from "../components/styles";
import { socketToken } from "../auth/socketToken";
import Hud from "./Hud";
import { knownReason, outcomeFor } from "./outcome";

export default function Match({ matchId, onRetry }: { matchId: number; onRetry: () => void }) {
  const { t } = useTranslation(["hud", "game", "lobby"]);
  const { user } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [end, setEnd] = useState<EndResult | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas)
      return;
    let game: MountedGame | null = null;
    let cancelled = false;

    async function start(target: HTMLCanvasElement) {
      try {
        const { mountGame } = await import("../../game/src/index");
        if (cancelled)
          return;
        game = mountGame(target, {
          matchId,
          getAccessToken: socketToken,
          onHud: setHud,
          onEnd: setEnd,
          minimapCanvas: minimapRef.current ?? undefined,
        });
      } catch {
        if (!cancelled)
          setLoadFailed(true);
      }
    }

    void start(canvas);
    return () => {
      cancelled = true;
      game?.unmount();
    };
  }, [matchId]);

  const status = loadFailed ? "error" : hud?.status ?? "connecting";
  const errorCode = loadFailed ? "asset_load_failed" : hud?.error ?? "unknown";
  const reason = end && knownReason(end.reason);
  const outcome = end && user ? outcomeFor(end, user.id) : null;
  const over = status === "error" || status === "finished";
  const live = status === "running" || status === "disconnected";

  return (
    // largura limitada pela altura da janela: o canvas 16:9 inteiro cabe na tela, e os recursos no
    // rodapé aparecem sem rolar (hud.md §2)
    <div className="relative mx-auto w-full max-w-[calc((100dvh-14rem)*16/9)]">
      <canvas
        ref={canvasRef}
        aria-label={t("view")}
        className="aspect-video w-full rounded border border-crypt-700 bg-black"
      />
      <canvas
        ref={minimapRef}
        aria-hidden="true"
        className="pointer-events-none absolute bottom-3 right-3 h-32 w-32 rounded border border-crypt-700 bg-crypt-950/90 sm:h-40 sm:w-40"
      />
      {hud && live && <Hud hud={hud} userId={user?.id ?? null} />}
      {/* fora da partida em andamento, o centro do canvas fala: conexão, erro ou fim */}
      {!live && (
        <div className="mt-2 flex justify-center md:absolute md:inset-0 md:mt-0 md:items-center md:p-3">
          <div className="flex max-w-md flex-col items-center gap-3 rounded bg-crypt-950/85 px-4 py-3 text-center">
            {status === "connecting" && <p role="status">{t("connecting", { matchId })}</p>}
            {status === "error" && (
              <>
                <ErrorNotice failure={{ code: errorCode, requestId: null }} />
                {/* remonta o jogo: reentra enquanto o Grace period segura a vaga */}
                <button type="button" onClick={onRetry} className={buttonSecondary}>
                  {t("retry")}
                </button>
              </>
            )}
            {status === "finished" && !outcome && <p role="status">{t("finished")}</p>}
            {outcome && (
              <div role="status" className="flex flex-col gap-1">
                <p className="text-xl font-bold">{t(`game:outcomes.${outcome}`)}</p>
                {reason && <p>{t(`game:reasons.${reason}`)}</p>}
              </div>
            )}
            {over && <Link to="/lobby" className={linkClass}>{t("lobby:room.back")}</Link>}
          </div>
        </div>
      )}
    </div>
  );
}
