import type { EndResult } from "../../game/src/index";

export type Outcome = "win" | "loss" | "draw";

// mount-game.md §5.5 ainda não fechou se o result é o da Room ou o de quem joga: no pvp o "win" da
// Room chega também para quem perdeu. O winnerIds responde certo nos dois modes
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