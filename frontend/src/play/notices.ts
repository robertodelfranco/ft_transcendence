import type { HudState } from "../../game/src/index";

export type DeathNotice = "coop" | "pvp";

export function deathNotice({ status, alive, maxHp, mode }: HudState): DeathNotice | null {
  if (status !== "running" || alive || maxHp <= 0 || mode === null)
    return null;
  return mode;
}