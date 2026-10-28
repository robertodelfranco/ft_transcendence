import type { EndResult } from "../../game/src/index";

export type Outcome = "win" | "loss" | "draw";

// o result é o da Room (mount-game.md §5.5, hud.md §11.2): no pvp o "win" chega também para quem
// perdeu. O desfecho local sai do winnerIds, nos dois modes
export function outcomeFor(end: EndResult, userId: number): Outcome {
  if (end.result === "draw")
    return "draw";
  return end.winnerIds.includes(userId) ? "win" : "loss";
}

const REASONS = [
  "boss_defeated", "all_dead", "frag_limit", "time_limit", "forfeit", "server_shutdown",
] as const;

export type Reason = (typeof REASONS)[number];

export function knownReason(reason: string): Reason | null {
  return (REASONS as readonly string[]).includes(reason) ? (reason as Reason) : null;
}