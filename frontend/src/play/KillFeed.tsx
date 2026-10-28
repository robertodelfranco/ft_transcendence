import { useTranslation } from "react-i18next";
import type { HudState } from "../../game/src/index";
import { nameOf, type HudPlayer } from "./players";
import { recentKills } from "./scoreboard";

// Topo direito no pvp (hud.md §5): só mortes de Player, a mais recente primeiro. Não é região viva:
// anunciar cada Frag atrapalharia quem joga com leitor de tela
export default function KillFeed({ killfeed, players }: {
  killfeed: HudState["killfeed"];
  players: HudPlayer[];
}) {
  const { t } = useTranslation("hud");
  const lines = recentKills(killfeed);

  if (lines.length === 0)
    return null;

  const name = (id: number) => nameOf(players, id) ?? t("unknownPlayer", { id });

  return (
    <ol aria-label={t("feed.label")} className="flex flex-col gap-1 md:items-end">
      {lines.map((entry, index) => (
        // o tick sozinho pode repetir; o índice separa registros iguais
        <li key={`${entry.tick}:${entry.victim}:${index}`}>
          {entry.by === null
            ? t("feed.died", { victim: name(entry.victim) })
            : t("feed.frag", { by: name(entry.by), victim: name(entry.victim) })}
        </li>
      ))}
    </ol>
  );
}