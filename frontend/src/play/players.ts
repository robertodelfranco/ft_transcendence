import type { HudState } from "../../game/src/index";

export type HudPlayer = HudState["players"][number];

// Player local primeiro, depois por id crescente (hud.md §3). Copia antes de ordenar: a lista é
// do jogo, e o sort ordena no lugar
export function orderPlayers(players: HudPlayer[], userId: number | null): HudPlayer[] {
  return [...players].sort((a, b) => Number(b.id === userId) - Number(a.id === userId) || a.id - b.id);
}