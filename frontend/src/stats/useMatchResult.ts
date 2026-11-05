import { useEffect, useState } from "react";
import { ApiError, apiFetch } from "../api/client";
import type { MatchDetail } from "../api/types";
import { toFailure, type Failure } from "../components/ErrorNotice";

// matches-api.md §2.4: o game_over sai antes de o record_match_result gravar o Match
export const RESULT_RETRY_MS = 1000;

function notRecordedYet(error: unknown): boolean {
  return error instanceof ApiError && error.code === "match_not_finished";
}

// GET /api/matches/{id}/result. No 409 match_not_finished, tenta de novo uma vez depois de ~1 s;
// a segunda recusa, o match_aborted e o 404 viram erro na tela, sem nova tentativa
export function useMatchResult(matchId: number) {
  const [detail, setDetail] = useState<MatchDetail | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);

  useEffect(() => {
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | undefined;

    function load(lastTry: boolean) {
      apiFetch<MatchDetail>(`/api/matches/${matchId}/result`)
        .then((loaded) => {
          if (!cancelled)
            setDetail(loaded);
        })
        .catch((error: unknown) => {
          if (cancelled)
            return;
          if (!lastTry && notRecordedYet(error))
            retry = setTimeout(() => load(true), RESULT_RETRY_MS);
          else
            setFailure(toFailure(error));
        });
    }

    load(false);
    // sair da tela durante a espera cancela a segunda tentativa
    return () => {
      cancelled = true;
      clearTimeout(retry);
    };
  }, [matchId]);

  return { detail, failure };
}
