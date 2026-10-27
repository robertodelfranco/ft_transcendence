import { useTranslation } from "react-i18next";
import { orderPlayers, type HudPlayer } from "./players";

// Topo esquerdo no coop (hud.md §3). Morto e desconectado são estados independentes, cada um com
// rótulo além do esmaecido. O nome longo é cortado na tela, mas o texto continua inteiro para o
// leitor de tela, e o title mostra o nome no hover
export default function Players({ players, userId }: { players: HudPlayer[]; userId: number | null }) {
  const { t } = useTranslation("hud");

  return (
    <ul aria-label={t("players.label")} className="flex flex-col gap-1">
      {orderPlayers(players, userId).map((player) => (
        <li
          key={player.id}
          className={`flex items-center gap-2 ${player.alive && player.connected ? "" : "opacity-60"}`}
        >
          <span title={player.name} className="max-w-32 truncate font-bold">{player.name}</span>
          {player.id === userId && <span className="text-bone/70">{t("players.you")}</span>}
          <span>{t("players.hp", { hp: player.hp })}</span>
          {!player.alive && <span className="text-red-400">{t("players.dead")}</span>}
          {!player.connected && <span className="text-bone/70">{t("players.offline")}</span>}
        </li>
      ))}
    </ul>
  );
}