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

  return (
    <>
      <canvas
        ref={canvasRef}
        aria-label={t("view")}
        className="aspect-video w-full rounded border border-crypt-700 bg-black"
      />
      {hud && (status === "running" || status === "disconnected") && <Hud hud={hud} />}
      {status === "connecting" && <p role="status">{t("connecting", { matchId })}</p>}
      {status === "disconnected" && <p role="status">{t("reconnecting")}</p>}
      {status === "error" && (
        <>
          <ErrorNotice failure={{ code: errorCode, requestId: null }} />
          {/* remonta o jogo: reentra enquanto o Grace period segura a vaga */}
          <button type="button" onClick={onRetry} className={`self-start ${buttonSecondary}`}>
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
      {over && <Link to="/lobby" className={`self-start ${linkClass}`}>{t("lobby:room.back")}</Link>}
    </>
  );
}