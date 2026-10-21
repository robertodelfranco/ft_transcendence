import type { TFunction } from "i18next";
import type { Mode, RoomOptions } from "../api/types";

export const MODES: readonly Mode[] = ["coop", "pvp"];

// Mínimo de Players para o start, como o MIN_PLAYERS do backend (rooms.md "Em aberto" 3)
export const MIN_PLAYERS: Record<Mode, number> = { coop: 1, pvp: 2 };

// Defaults do room-options.md §2, só para mostrar no formulário antes de criar. Quem aplica é o
// servidor (a dataclass RoomOptions); a Room criada traz as opções dela em `options`
export const DEFAULT_OPTIONS: Record<Mode, RoomOptions> = {
  coop: { theme: "dungeon", start_hp: 10, pickups: { potion: true, mana: true, armor: true } },
  pvp: {
    theme: "dungeon", start_hp: 10, pickups: { potion: true, mana: true, armor: true },
    frag_limit: 5, time_limit_s: 180,
  },
};

// Map sem tradução mostra o próprio nome do arquivo (i18n.md §2.2)
export function mapName(t: TFunction, map: string): string {
  return t(`game:maps.${map}`, { defaultValue: map });
}
