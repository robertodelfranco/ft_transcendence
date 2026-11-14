import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import type { MatchDetail, MatchPlayerRow } from "../api/types";
import { linkClass } from "../components/styles";
import Avatar from "../profile/Avatar";

type Column = { key: string; value: (player: MatchPlayerRow) => string };

// Os números de cada Player no Match (matches-api.md §2.4): o coop conta Kills, o pvp conta Frags
// e mostra o Elo. Em tela estreita, a tabela rola sozinha, sem rolar a página
export default function MatchPlayers({ detail, userId }: {
  detail: MatchDetail;
  userId: number | null;
}) {
  const { t, i18n } = useTranslation("stats");
  const signed = new Intl.NumberFormat(i18n.resolvedLanguage, { signDisplay: "exceptZero" });
  const pvp = detail.mode === "pvp";

  function elo(player: MatchPlayerRow): string {
    if (player.elo_before === null || player.elo_after === null)
      return t("result.none");
    return t("result.elo", {
      after: player.elo_after, delta: signed.format(player.elo_after - player.elo_before),
    });
  }

  const columns: Column[] = [
    pvp
      ? { key: "frags", value: (player) => String(player.frags) }
      : { key: "kills", value: (player) => String(player.kills) },
    { key: "deaths", value: (player) => String(player.deaths) },
    { key: "damageDealt", value: (player) => String(player.damage_dealt) },
    { key: "damageTaken", value: (player) => String(player.damage_taken) },
    { key: "xp", value: (player) => signed.format(player.xp_gained) },
  ];
  if (pvp)
    columns.push({ key: "elo", value: elo });

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="pb-2 text-left text-lg font-bold">{t("result.players")}</caption>
        <thead>
          <tr className="border-b border-crypt-700 text-bone/70">
            <th scope="col" className="py-2 pr-4 text-left">{t("result.columns.player")}</th>
            {columns.map((column) => (
              <th key={column.key} scope="col" className="py-2 pr-4 text-right">
                {t(`result.columns.${column.key}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {detail.players.map((player) => (
            <tr key={player.user_id} className="border-b border-crypt-700">
              <th scope="row" className="py-2 pr-4 text-left font-normal">
                <div className="flex items-center gap-2">
                  <Avatar user={player} />
                  <Link to={`/users/${player.user_id}`} className={linkClass}>
                    {player.username}
                  </Link>
                  {player.user_id === userId && <span className="text-bone/70">{t("result.you")}</span>}
                  {/* no coop a equipe ganha ou perde junta: marcar cada um não diz nada */}
                  {pvp && player.won && <span className="text-torch">{t("result.winner")}</span>}
                  {player.disconnected_at_end && (
                    <span className="text-bone/70">{t("result.disconnected")}</span>
                  )}
                </div>
              </th>
              {columns.map((column) => (
                <td key={column.key} className="py-2 pr-4 text-right tabular-nums">
                  {column.value(player)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
