import type { Mode } from "../types";

export interface PlayerFeedbackState {
  damage: number;
  dead: boolean;
  respawn: number;
}

const HIT_MS = 220;
const RESPAWN_MS = 350;

// Apenas apresentação. O Snapshot continua sendo a fonte de alive, HP e posição.
export function createPlayerFeedback() {
  let alive: boolean | null = null;
  let hitAt = -Infinity;
  let respawnAt = -Infinity;

  function clearTransient(): void {
    hitAt = respawnAt = -Infinity;
  }

  return {
    reset() {
      alive = null;
      clearTransient();
    },
    clearTransient,
    hit(now: number) {
      if (alive === true) hitAt = now; // renova, sem somar intensidade
    },
    snapshot(nextAlive: boolean, mode: Mode, now: number) {
      if (!nextAlive) clearTransient();
      else if (alive === false && mode === "pvp") respawnAt = now;
      alive = nextAlive;
    },
    state(now: number): PlayerFeedbackState {
      const fade = (start: number, duration: number) =>
        Math.max(0, Math.min(1, 1 - (now - start) / duration));
      return { damage: fade(hitAt, HIT_MS), dead: alive === false,
        respawn: fade(respawnAt, RESPAWN_MS) };
    },
  };
}
