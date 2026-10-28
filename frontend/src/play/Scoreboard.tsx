import { useTranslation } from "react-i18next";
import type { HudState } from "../../game/src/index";
import { nameOf } from "./players";
import { formatClock } from "./scoreboard";

// Topo esquerdo no pvp (hud.md §4): nomes e Frags na ordem do scoreboard, e o relógio do Snapshot.
// Placar null não vira 0 × 0
export default function Scoreboard({ hud, userId }: { hud: HudState; userId: number | null }) {
  const { t } = useTranslation("hud");

  if (hud.scoreboard === null)
    return <p>{t("scoreboard.unavailable")}</p>;

  return (
    <div className="flex flex-col gap-1">
      <ol aria-label={t("scoreboard.label")} className="flex flex-col gap-1">
        {hud.scoreboard.players.map(({ id, frags }) => {
          const name = nameOf(hud.players, id) ?? t("unknownPlayer", { id });
          return (
            <li key={id} className="flex items-center gap-2">
              <span title={name} className="max-w-32 truncate font-bold">{name}</span>
              {id === userId && <span className="text-bone/70">{t("players.you")}</span>}
              <span>{t("scoreboard.frags", { frags })}</span>
            </li>
          );
        })}
      </ol>
      <dl className="flex gap-2">
        <dt className="text-bone/70">{t("scoreboard.timeLeft")}</dt>
        <dd className="font-bold tabular-nums">{formatClock(hud.scoreboard.timeLeftS)}</dd>
      </dl>
    </div>
  );
}