import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router";
import { apiFetch } from "../api/client";
import type { RoomInfo } from "../api/types";
import { buttonPrimary } from "./styles";

// Faixa "Voltar à partida": quem saiu do /play tem o Grace period (30 s) para voltar, e a casca
// pergunta ao servidor a cada troca de página (não é polling, matches-api.md §2.5). Só a partida
// em andamento: a sala de espera já está na lista do /lobby
export default function CurrentMatchBanner() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const inMatch = pathname.startsWith("/play/");
  const [matchId, setMatchId] = useState<number | null>(null);

  useEffect(() => {
    if (inMatch)
      return;
    let cancelled = false;
    apiFetch<RoomInfo | undefined>("/api/matches/current")
      .then((room) => {
        if (!cancelled)
          setMatchId(room?.status === "running" ? room.match_id : null);
      })
      // a faixa é um atalho: se a consulta falhar, ela só não aparece
      .catch(() => {
        if (!cancelled)
          setMatchId(null);
      });
    return () => {
      cancelled = true;
    };
  }, [pathname, inMatch]);

  if (inMatch || matchId === null)
    return null;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-b border-torch/60 bg-torch/10 px-4 py-2 text-sm text-torch"
    >
      <p>{t("currentMatch.notice")}</p>
      <Link to={`/play/${matchId}`} className={buttonPrimary}>{t("currentMatch.back")}</Link>
    </div>
  );
}
