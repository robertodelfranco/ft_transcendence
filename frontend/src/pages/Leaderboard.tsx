import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import type { LeaderboardMetric, LeaderboardRow, Mode } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import ErrorNotice from "../components/ErrorNotice";
import Loading from "../components/Loading";
import { fieldClass } from "../components/styles";
import { useApi } from "../hooks/useApi";
import { usePageTitle } from "../hooks/usePageTitle";
import { MODES } from "../lobby/roomOptions";
import { LEADERBOARD_LIMIT, METRICS, parseSelection } from "../stats/leaderboard";
import LeaderboardTable from "../stats/LeaderboardTable";

// /leaderboard (i18n.md §2.6): o ranking por Mode e métrica. A escolha mora na URL, então o link
// pode ser compartilhado e o Voltar do navegador desfaz a troca
export default function Leaderboard() {
  const { t } = useTranslation(["stats", "game"]);
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const selection = parseSelection(params);
  const { mode, metric } = selection;
  usePageTitle("stats:leaderboard.title");

  const query = new URLSearchParams({ mode, metric, limit: String(LEADERBOARD_LIMIT) });
  const { data, failure } = useApi<{ items: LeaderboardRow[] }>(`/api/leaderboard?${query}`);

  // replace: cada troca de filtro não vira uma entrada nova no histórico
  function choose(next: { mode: Mode; metric: LeaderboardMetric }) {
    setParams(next, { replace: true });
  }

  let body;
  if (failure)
    body = <ErrorNotice failure={failure} />;
  else if (!data)
    body = <Loading />;
  else if (data.items.length === 0)
    body = <p className="text-bone/70">{t("leaderboard.empty")}</p>;
  else
    body = <LeaderboardTable rows={data.items} selection={selection} userId={user?.id ?? null} />;

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <h1 className="text-2xl font-bold text-torch">{t("leaderboard.title")}</h1>
      <div className="flex flex-wrap gap-4">
        <label className="flex flex-col gap-1 text-sm">
          {t("leaderboard.mode")}
          {/* trocar de Mode volta à métrica padrão dele: xp no coop, elo no pvp */}
          <select
            value={mode}
            onChange={(e) => {
              const next = e.target.value as Mode;
              choose({ mode: next, metric: METRICS[next][0] });
            }}
            className={fieldClass}
          >
            {MODES.map((option) => (
              <option key={option} value={option}>{t(`game:modes.${option}`)}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t("leaderboard.metric")}
          <select
            value={metric}
            onChange={(e) => choose({ mode, metric: e.target.value as LeaderboardMetric })}
            className={fieldClass}
          >
            {METRICS[mode].map((option) => (
              <option key={option} value={option}>{t(`leaderboard.metrics.${option}`)}</option>
            ))}
          </select>
        </label>
      </div>
      {body}
    </section>
  );
}
