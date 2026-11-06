import { http, HttpResponse } from "msw";
import type { MatchDetail } from "../api/types";
import matchResult from "./fixtures/matchResult.json";

// Rotas de leitura das partidas (matches-api.md §2.3–§2.4), com os exemplos da §3
const result = matchResult as MatchDetail;

// Envelope de erro do auth.md §2.5; `message` é texto de log, aqui só repete o code
function apiError(status: number, code: string) {
  return HttpResponse.json(
    { error: { code, message: code, request_id: "mock0001", fields: null } },
    { status },
  );
}

export const statsHandlers = [
  // só o Match 14 do exemplo existe e está gravado; os outros dão 404
  http.get("/api/matches/:matchId/result", ({ params }) =>
    Number(params.matchId) === result.match_id
      ? HttpResponse.json(result)
      : apiError(404, "match_not_found"),
  ),
];
