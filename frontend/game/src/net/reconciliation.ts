import { applyInput, type Body, type CollisionWorld, type MoveInput } from "../applyInput";
import { TICK_RATE } from "../rules";
import type { PlayerSnapshot } from "../types";

const STEP_S = 1 / TICK_RATE;

export interface PendingInput {
  readonly seq: number;
  readonly input: MoveInput;
}

export function reconcilePlayer(
  player: PlayerSnapshot,
  lastInputSeq: number,
  pending: readonly PendingInput[],
  world: CollisionWorld,
): { body: Body; pending: PendingInput[] } {
  const remaining = pending.filter(({ seq }) => seq > lastInputSeq);
  let body: Body = {
    x: player.x,
    y: player.y,
    angle: Math.atan2(player.dx, -player.dy),
  };

  if (player.alive) {
    for (const { input } of remaining) {
      body = applyInput(body, input, world, STEP_S);
    }
  }

  return { body, pending: remaining };
}
