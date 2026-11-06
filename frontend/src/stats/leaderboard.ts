import { MODES } from "../lobby/roomOptions";
import type { LeaderboardMetric, Mode } from "../api/types";

// As métricas que fazem sentido em cada Mode; a primeira é o padrão do contrato (matches-api.md §2.3):
// xp no coop, elo no pvp. O servidor aceita também elo no coop e kills no pvp, mas lá o valor nunca
// muda (Elo parado em 1000, Kills sempre 0), então a tela não oferece
export const METRICS: Record<Mode, readonly LeaderboardMetric[]> = {
  coop: ["xp", "wins", "kills"],
  pvp: ["elo", "xp", "wins"],
};

export const LEADERBOARD_LIMIT = 20;

export interface Selection {
  mode: Mode;
  metric: LeaderboardMetric;
}

// O que a URL escolhe (?mode=pvp&metric=wins). Valor que não existe, ou métrica que o Mode não tem,
// volta ao padrão: um parâmetro fora da lista nunca vai ao servidor (daria 422 no console)
export function parseSelection(params: URLSearchParams): Selection {
  const asked = params.get("mode");
  const mode = MODES.find((candidate) => candidate === asked) ?? MODES[0];
  const metric = METRICS[mode].find((candidate) => candidate === params.get("metric")) ?? METRICS[mode][0];
  return { mode, metric };
}
