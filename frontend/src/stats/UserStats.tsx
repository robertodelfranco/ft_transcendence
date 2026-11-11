import type { TFunction } from "i18next";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import type { Mode, PlayerStats, UserStats as UserStatsData } from "../api/types";
import ErrorNotice from "../components/ErrorNotice";
import Loading from "../components/Loading";
import { useApi } from "../hooks/useApi";
import { MODES } from "../lobby/roomOptions";

// GET /api/users/{id}/stats (matches-api.md §2.3): o agregado por Mode, já calculado no servidor.
// A tela não divide nem sabe a fórmula de level (decisão 5): só mostra o que a resposta traz
export default function UserStats({ userId }: { userId: number }) {
  const { t } = useTranslation("stats");
  const titleId = useId();
  const { data, failure } = useApi<UserStatsData>(`/api/users/${userId}/stats`);

  let body;
  if (failure)
    body = <ErrorNotice failure={failure} />;
  else if (!data)
    body = <Loading />;
  else
    body = (
      <div className="grid gap-4 sm:grid-cols-2">
        {MODES.map((mode) => <ModeStats key={mode} mode={mode} stats={data[mode]} />)}
      </div>
    );

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3">
      <h2 id={titleId} className="text-lg font-bold">{t("player.title")}</h2>
      {body}
    </section>
  );
}

function playtime(t: TFunction, seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? t("player.hoursMinutes", { hours, minutes }) : t("player.minutes", { minutes });
}

function ModeStats({ mode, stats }: { mode: Mode; stats: PlayerStats }) {
  const { t, i18n } = useTranslation(["stats", "game"]);
  const headingId = useId();
  const number = new Intl.NumberFormat(i18n.resolvedLanguage);
  const percent = new Intl.NumberFormat(i18n.resolvedLanguage, {
    style: "percent", maximumFractionDigits: 0,
  });

  // um item por linha: texto traduzido não se concatena (i18n.md §2.2). O Elo só existe no pvp, e
  // cada Mode conta o que tem: Kills no coop, Frags no pvp
  const rows: Array<[string, string]> = [];
  if (mode === "pvp")
    rows.push([t("player.elo"), number.format(stats.elo)]);
  rows.push(
    [t("player.matches"), number.format(stats.matches_played)],
    [t("player.wins"), number.format(stats.wins)],
    [t("player.losses"), number.format(stats.losses)],
    [t("player.draws"), number.format(stats.draws)],
    // sem partida não há taxa: 0 % diria que perdeu tudo
    [t("player.winRate"), stats.matches_played === 0 ? t("player.none") : percent.format(stats.win_rate)],
    mode === "pvp"
      ? [t("player.frags"), number.format(stats.frags)]
      : [t("player.kills"), number.format(stats.kills)],
    [t("player.deaths"), number.format(stats.deaths)],
    [t("player.playtime"), playtime(t, stats.playtime_s)],
  );

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3 rounded border border-crypt-700 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 id={headingId} className="font-bold">{t(`game:modes.${mode}`)}</h3>
        <p className="font-bold text-torch">{t("player.level", { level: stats.level })}</p>
      </div>
      {/* a barra do level atual: do XP em que ele começou até o XP em que começa o próximo. O servidor
          entrega as duas pontas prontas (matches-api.md §2.3), a tela não conhece a fórmula */}
      <progress
        value={stats.xp - stats.xp_level_start}
        max={stats.xp + stats.xp_to_next_level - stats.xp_level_start}
        aria-label={t("player.progress")}
        className="h-3 w-full appearance-none overflow-hidden rounded bg-crypt-700 [&::-moz-progress-bar]:bg-torch [&::-webkit-progress-bar]:bg-crypt-700 [&::-webkit-progress-value]:bg-torch"
      />
      <p className="flex flex-wrap gap-x-3 text-sm text-bone/70">
        <span>{t("player.xp", { xp: number.format(stats.xp) })}</span>
        <span>{t("player.toNext", { xp: number.format(stats.xp_to_next_level), level: stats.level + 1 })}</span>
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-bone/70">{label}</dt>
            <dd className="tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
