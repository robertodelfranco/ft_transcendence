import type { HudState } from "../../game/src/index";

const FEED_LINES = 5;

// timeLeftS do Snapshot em mm:ss (hud.md §4): arredonda para cima e não passa de zero. A HUD não
// conta o tempo sozinha; o relógio só anda quando chega um Snapshot
export function formatClock(seconds: number): string {
  const total = Math.max(Math.ceil(seconds), 0);
  const minutes = String(Math.floor(total / 60)).padStart(2, "0");
  return `${minutes}:${String(total % 60).padStart(2, "0")}`;
}

// O jogo guarda o feed do mais antigo para o mais recente; a HUD mostra o mais recente primeiro
export function recentKills(killfeed: HudState["killfeed"]): HudState["killfeed"] {
  return [...killfeed].reverse().slice(0, FEED_LINES);
}