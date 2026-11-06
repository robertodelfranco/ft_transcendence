import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import type { LeaderboardRow } from "../api/types";
import { linkClass } from "../components/styles";
import Avatar from "../profile/Avatar";
import type { Selection } from "./leaderboard";

// As linhas já vêm ordenadas e numeradas pelo servidor (progression.md §7): a tela não reordena nem
// calcula posição. Quem está logado aparece marcado, para achar a própria linha
export default function LeaderboardTable({ rows, selection, userId }: {
  rows: LeaderboardRow[];
  selection: Selection;
  userId: number | null;
}) {
  const { t, i18n } = useTranslation(["stats", "game"]);
  const number = new Intl.NumberFormat(i18n.resolvedLanguage);
  const metric = t(`leaderboard.metrics.${selection.metric}`);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">
          {t("leaderboard.caption", { mode: t(`game:modes.${selection.mode}`), metric })}
        </caption>
        <thead>
          <tr className="border-b border-crypt-700 text-bone/70">
            <th scope="col" className="py-2 pr-4 text-left">{t("leaderboard.columns.rank")}</th>
            <th scope="col" className="py-2 pr-4 text-left">{t("leaderboard.columns.player")}</th>
            <th scope="col" className="py-2 pr-4 text-right">{metric}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.user_id} className="border-b border-crypt-700">
              <td className="py-2 pr-4 tabular-nums">{row.rank}</td>
              <th scope="row" className="py-2 pr-4 text-left font-normal">
                <div className="flex items-center gap-2">
                  <Avatar user={row} />
                  <Link to={`/users/${row.user_id}`} className={`font-bold ${linkClass}`}>
                    {row.username}
                  </Link>
                  {row.user_id === userId && <span className="text-bone/70">{t("leaderboard.you")}</span>}
                </div>
              </th>
              <td className="py-2 pr-4 text-right font-bold tabular-nums">{number.format(row.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
