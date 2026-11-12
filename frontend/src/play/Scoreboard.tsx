import { useTranslation } from "react-i18next";
import type { HudState } from "../../game/src/index";
import { nameOf } from "./playerUtils";
import { formatClock } from "./scoreboardUtils";

// Topo esquerdo no pvp (hud.md §4): nomes e Frags na ordem do scoreboard, e o relógio do Snapshot.
// Placar null não vira 0 × 0
export default function Scoreboard({ hud, userId }: { hud: HudState; userId: number | null }) {
  const { t } = useTranslation("hud");

  if (hud.scoreboard === null)
    return <p>{t("scoreboard.unavailable")}</p>;

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <ol aria-label={t("scoreboard.label")} className="flex flex-col gap-1">
        {hud.scoreboard.players.map(({ id, frags }) => {
          const name = nameOf(hud.players, id) ?? t("unknownPlayer", { id });
          return (
            <li key={id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <span title={name} className={`min-w-0 max-w-28 truncate ${id === userId ? "font-medium text-bone" : "text-bone/85"}`}>{name}</span>
                {id === userId && <span className="text-[10px] text-torch/90">{t("players.you")}</span>}
              </div>
              <span className="text-[11px] tabular-nums text-bone/90">{t("scoreboard.frags", { frags })}</span>
            </li>
          );
        })}
      </ol>
      <dl className="flex items-center justify-between gap-3 pt-0.5">
        <dt className="flex items-center gap-1.5 text-[10px] text-bone/80">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-3 w-3 shrink-0">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
          {t("scoreboard.timeLeft")}
        </dt>
        <dd className="font-mono text-xs tabular-nums text-bone/90">{formatClock(hud.scoreboard.timeLeftS)}</dd>
      </dl>
    </div>
  );
}
