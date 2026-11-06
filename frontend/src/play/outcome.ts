import type { EndResult } from "../../game/src/index";
import type { MatchDetail } from "../api/types";

export type Outcome = "win" | "loss" | "draw";

// o result é o da Room (mount-game.md §5.5, hud.md §11.2): no pvp o "win" chega também para quem
// perdeu. O desfecho local sai do winnerIds, nos dois modes
export function outcomeFor(end: EndResult, userId: number): Outcome {
  if (end.result === "draw")
    return "draw";
  return end.winnerIds.includes(userId) ? "win" : "loss";
}

// O mesmo desfecho, a partir do Match gravado (matches-api.md §2.4): quem ganhou é o players[].won.
// null para quem não jogou, ao abrir pelo histórico uma partida de outra pessoa
export function matchOutcome(detail: MatchDetail, userId: number): Outcome | null {
  const me = detail.players.find((player) => player.user_id === userId);
  if (!me)
    return null;
  if (detail.result === "draw")
    return "draw";
  return me.won ? "win" : "loss";
}

const REASONS = [
  "boss_defeated", "all_dead", "frag_limit", "time_limit", "forfeit", "server_shutdown",
] as const;

export type Reason = (typeof REASONS)[number];

export function knownReason(reason: string): Reason | null {
  return (REASONS as readonly string[]).includes(reason) ? (reason as Reason) : null;
}