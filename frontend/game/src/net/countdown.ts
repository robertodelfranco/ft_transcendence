// Contagem 3, 2, 1 do início da partida (#255, ws-messages.md §2.4 e §2.9). O servidor congela a
// Room até countdown_end_tick; o cliente só lê o Snapshot, sem relógio próprio.
import { TICK_RATE } from "../rules";
import type { Snapshot } from "../types";

type Clock = Pick<Snapshot, "tick" | "countdown_end_tick">;

// Congelada: esperando os Players (null) ou com a contagem correndo
export function isFrozen({ tick, countdown_end_tick: end }: Clock): boolean {
  return end === null || tick < end;
}

// O que a HUD mostra: "waiting" enquanto falta Player conectar, os segundos que faltam (3, 2, 1)
// durante a contagem, e null com a partida valendo
export function countdownOf({ tick, countdown_end_tick: end }: Clock): "waiting" | number | null {
  if (end === null) return "waiting";
  const left = end - tick;
  return left > 0 ? Math.ceil(left / TICK_RATE) : null;
}
