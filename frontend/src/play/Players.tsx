import { useTranslation } from "react-i18next";
import { orderPlayers, type HudPlayer } from "./playerUtils";

// Esmaece nome e vida, e não os rótulos de estado: texto de 10 px com opacidade fica abaixo de 4,5:1
const dim = (player: HudPlayer) => (player.alive && player.connected ? "" : "opacity-60");

// Topo esquerdo no coop (hud.md §3). Morto e desconectado são estados independentes, cada um com
// rótulo além do esmaecido. O nome longo é cortado na tela, mas o texto continua inteiro para o
// leitor de tela, e o title mostra o nome no hover
export default function Players({ players, userId }: { players: HudPlayer[]; userId: number | null }) {
  const { t } = useTranslation("hud");

  return (
    <ul aria-label={t("players.label")} className="flex min-w-0 flex-col gap-1">
      {orderPlayers(players, userId).map((player) => (
        <li
          key={player.id}
          className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5"
        >
          <div className={`flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 ${dim(player)}`}>
            <span title={player.name} className={`min-w-0 max-w-28 truncate ${player.id === userId ? "font-medium text-bone" : "text-bone/85"}`}>{player.name}</span>
            {player.id === userId && <span className="text-[10px] text-torch/90">{t("players.you")}</span>}
          </div>
          <span className={`flex items-center gap-1 text-[11px] tabular-nums text-red-200 ${dim(player)}`}>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-3 w-3 shrink-0">
              <path d="M12 21 3.5 12.5a5.3 5.3 0 0 1 7.5-7.5L12 6l1-1a5.3 5.3 0 0 1 7.5 7.5Z" />
            </svg>
            {t("players.hp", { hp: player.hp })}
          </span>
          {(!player.alive || !player.connected) && (
            <div className="col-span-2 flex flex-wrap gap-2 text-[10px]">
              {!player.alive && <span className="text-red-400">{t("players.dead")}</span>}
              {!player.connected && <span className="text-bone/70">{t("players.offline")}</span>}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
