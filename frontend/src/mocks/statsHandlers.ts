import { http, HttpResponse } from "msw";
import type {
  AchievementsResponse, LeaderboardRow, MatchDetail, MatchHistoryItem, Page, UserStats,
} from "../api/types";
import achievements from "./fixtures/achievements.json";
import authResponse from "./fixtures/authResponse.json";
import leaderboard from "./fixtures/leaderboard.json";
import matchHistory from "./fixtures/matchHistory.json";
import matchResult from "./fixtures/matchResult.json";
import userStats from "./fixtures/userStats.json";
import users from "./fixtures/users.json";

// Rotas de leitura das partidas (matches-api.md §2.3–§2.4), com os exemplos da §3
const result = matchResult as MatchDetail;
const history = matchHistory as Page<MatchHistoryItem>;
const stats = userStats as UserStats;
const unlocked = achievements as AchievementsResponse;
const ranking = leaderboard as { items: LeaderboardRow[] };

// os valores que o servidor aceita em mode e metric (matches-api.md §2.3)
const MODES = ["coop", "pvp"];
const METRICS = ["elo", "xp", "wins", "kills"];

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

  // as mesmas conquistas do exemplo (as do User 7 depois da partida 14) para qualquer User do mock
  http.get("/api/users/:userId/achievements", ({ params }) =>
    knownUser(params.userId) ? HttpResponse.json(unlocked) : apiError(404, "user_not_found"),
  ),

  // o mesmo ranking do exemplo para qualquer Mode e métrica. Valor fora da lista dá 422, que é o que
  // o FastAPI devolve: assim um teste pega a tela mandando parâmetro que o servidor recusaria
  http.get("/api/leaderboard", ({ request }) => {
    const query = new URL(request.url).searchParams;
    const mode = query.get("mode");
    const metric = query.get("metric");
    if ((mode !== null && !MODES.includes(mode)) || (metric !== null && !METRICS.includes(metric)))
      return apiError(422, "validation_error");
    return HttpResponse.json(ranking);
  }),
];
