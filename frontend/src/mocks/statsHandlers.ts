import { http, HttpResponse } from "msw";
import type { MatchDetail, MatchHistoryItem, Page, UserStats } from "../api/types";
import authResponse from "./fixtures/authResponse.json";
import matchHistory from "./fixtures/matchHistory.json";
import matchResult from "./fixtures/matchResult.json";
import userStats from "./fixtures/userStats.json";
import users from "./fixtures/users.json";

// Rotas de leitura das partidas (matches-api.md §2.3–§2.4), com os exemplos da §3
const result = matchResult as MatchDetail;
const history = matchHistory as Page<MatchHistoryItem>;
const stats = userStats as UserStats;

// os Users que existem no mock: quem loga e os da busca
function knownUser(userId: unknown): boolean {
  const id = Number(userId);
  return id === authResponse.user.id || users.items.some((user) => user.id === id);
}

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

  // a mesma página do exemplo para qualquer User do mock, seja qual for a página pedida
  http.get("/api/users/:userId/matches", ({ params }) =>
    knownUser(params.userId) ? HttpResponse.json(history) : apiError(404, "user_not_found"),
  ),

  // as mesmas estatísticas do exemplo para qualquer User do mock
  http.get("/api/users/:userId/stats", ({ params }) =>
    knownUser(params.userId) ? HttpResponse.json(stats) : apiError(404, "user_not_found"),
  ),
];
