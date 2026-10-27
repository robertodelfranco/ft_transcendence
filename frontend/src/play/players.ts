import type { HudState } from "../../game/src/index";

export type HudPlayer = HudState["players"][number];

// Player local primeiro, depois por id crescente (hud.md §3). Copia antes de ordenar: a lista é
// do jogo, e o sort ordena no lugar
export function orderPlayers(players: HudPlayer[], userId: number | null): HudPlayer[] {
  return [...players].sort((a, b) => Number(b.id === userId) - Number(a.id === userId) || a.id - b.id);
}

// undefined quando o Player não está na lista: quem chama mostra um nome traduzido com o id
export function nameOf(players: HudPlayer[], id: number): string | undefined {
  return players.find((player) => player.id === id)?.name;
}