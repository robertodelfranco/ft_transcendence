import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";
import type { EndResult, HudState, MountedGame } from "../../game/src/index";
import { ApiError, apiFetch } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import ErrorNotice, { toFailure, type Failure } from "../components/ErrorNotice";
import { buttonPrimary, buttonSecondary, linkClass } from "../components/styles";
import { socketToken } from "../auth/socketToken";
import Countdown from "./Countdown";
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
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [leaveFailure, setLeaveFailure] = useState<Failure | null>(null);

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

  // "Sair da partida" (#240): o servidor tira o Player na hora, sem Grace period, e fecha o socket
  // com 1000; o unmount, ao navegar, libera o resto
  async function leave() {
    setLeaveFailure(null);
    setLeaving(true);
    if (document.pointerLockElement)
      document.exitPointerLock();
    try {
      await apiFetch(`/api/matches/${matchId}/leave`, { method: "POST" });
    } catch (error) {
      // 404: a Room já foi removida (60 s depois do fim), e não há de onde sair
      if (!(error instanceof ApiError && error.status === 404)) {
        setLeaving(false);
        setConfirming(false);
        setLeaveFailure(toFailure(error));
        return;
      }
    }
    navigate("/lobby");
  }

  return (
    // largura limitada pela altura da janela: o canvas 16:9 inteiro cabe na tela, e os recursos no
    // rodapé aparecem sem rolar (hud.md §2)
    <div className="mx-auto w-full max-w-[calc((100dvh-14rem)*16/9)]">
      {/* o que fica sobre o canvas no md se ancora aqui, e não no botão de sair abaixo */}
      <div className="relative">
        {/* o minimapa se ancora ao canvas, não ao bloco inteiro: abaixo do md o HUD vem depois do
            canvas e alonga o bloco, e o canto inferior direito dele passava a ser o do HUD */}
        <div className="relative">
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={t("view")}
            className="block aspect-video w-full rounded border border-crypt-700 bg-black"
          />
          {status === "running" && hud?.alive && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 top-1/2 z-20 h-[20px] w-[20px] -translate-x-1/2 -translate-y-1/2"
            >
              <span className="absolute left-[9px] top-0 h-[6px] w-[2px] bg-white ring-1 ring-black" />
              <span className="absolute bottom-0 left-[9px] h-[6px] w-[2px] bg-white ring-1 ring-black" />
              <span className="absolute left-0 top-[9px] h-[2px] w-[6px] bg-white ring-1 ring-black" />
              <span className="absolute right-0 top-[9px] h-[2px] w-[6px] bg-white ring-1 ring-black" />
            </span>
          )}
          <canvas
            ref={minimapRef}
            aria-hidden="true"
            className="pointer-events-none absolute bottom-3 left-3 aspect-square w-1/4 opacity-85 sm:w-32 md:left-auto md:right-3"
          />
          {/* #255: cobre só o canvas, também abaixo do md, onde a HUD vem depois dele */}
          {hud && live && <Countdown countdown={hud.countdown} />}
        </div>
        {hud && live && <Hud hud={hud} userId={user?.id ?? null} />}
        {/* fora da partida em andamento, o centro do canvas fala: conexão, erro ou fim. Saindo, o
            close 1000 do servidor marcaria "finished": a tela de fim não pisca antes do Lobby */}
        {!live && !leaving && (
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
              {/* o detalhe vem do banco, numa tela própria que o histórico também abre */}
              {status === "finished" && (
                <Link to={`/matches/${matchId}`} className={buttonPrimary}>{t("viewResult")}</Link>
              )}
              {over && <Link to="/lobby" className={linkClass}>{t("lobby:room.back")}</Link>}
            </div>
          </div>
        )}
      </div>
      {/* abaixo do canvas: com o Pointer Lock, o Esc solta o mouse e o botão fica clicável */}
      {(live || leaving) && (
        <div className="mt-2 flex flex-col items-end gap-2">
          {leaveFailure && <ErrorNotice failure={leaveFailure} />}
          {confirming ? (
            <div role="group" aria-label={t("leave.button")} className="flex flex-wrap items-center justify-end gap-2">
              <p>{t("leave.confirm")}</p>
              <button type="button" disabled={leaving} onClick={() => void leave()} className={buttonPrimary}>
                {leaving ? t("leave.leaving") : t("leave.yes")}
              </button>
              <button type="button" disabled={leaving} onClick={() => setConfirming(false)} className={buttonSecondary}>
                {t("leave.no")}
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirming(true)} className={buttonSecondary}>
              {t("leave.button")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
