import type { HudState } from "../../game/src/index";

export type DeathNotice = "coop" | "pvp";

// Aviso de morte da hud.md §4, escolhido pelo Mode: só em running e já com Snapshot.
// Antes do primeiro Snapshot o jogo manda zeros (alive false, maxHp 0), e isso não é morte
export function deathNotice({ status, alive, maxHp, mode }: HudState): DeathNotice | null {
  if (status !== "running" || alive || maxHp <= 0 || mode === null)
    return null;
  return mode;
}