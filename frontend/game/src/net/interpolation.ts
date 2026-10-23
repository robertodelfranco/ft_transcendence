// Interpolation (arq. §7.2; ws-messages.md §2.8): os outros Players, os Enemies, o Boss e os
// Projectiles são desenhados INTERP_DELAY_MS no passado, entre os dois Snapshots que cercam esse
// instante. O Player local não passa aqui: ele é da Prediction (predictionLoop.ts).
// Funções puras: quem chama passa o horário de chegada do Snapshot e o do quadro.
import type { ViewState } from "../render/renderer";
import { TICK_RATE } from "../rules";
import type { PlayerSnapshot, Snapshot } from "../types";

// um pouco mais que um intervalo de Snapshot (66 ms): quase sempre há um Snapshot depois do
// instante desenhado, mesmo com um atrasado
export const INTERP_DELAY_MS = 100;
// o mais rápido do jogo, o Projectile, anda 12 cél/s × 66 ms ≈ 0,8 célula entre dois Snapshots;
// acima disto não é movimento, é respawn, e deslizar até lá seria atravessar paredes
export const TELEPORT_CELLS = 2;
// ~2 s a 15 Hz; o buffer só chega aqui se os quadros pararem (aba em segundo plano)
const BUFFER_MAX = 32;
const TICK_MS = 1000 / TICK_RATE;
// O atraso da rede desce na hora e sobe devagar: o Snapshot que chegou mais rápido é o que melhor
// mede a distância entre os dois relógios, e um segurado por retransmissão quase não a mexe
const LAG_RISE = 0.02;

export type Interpolated = Pick<ViewState, "otherPlayers" | "enemies" | "boss" | "projectiles">;

export interface Interpolator {
  push(snapshot: Snapshot, atMs: number): void;
  sample(nowMs: number): Interpolated | null; // null antes do primeiro Snapshot
}

// A linha do tempo é a do servidor (tick), não a da chegada: dois Snapshots que chegam juntos
// depois de uma retransmissão continuam a 66 ms um do outro, e o outro Player não salta
interface Entry {
  tickMs: number;
  snapshot: Snapshot;
}

interface Point {
  x: number;
  y: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function lerpPoint<T extends Point>(a: T, b: T | undefined, t: number): T {
  if (b === undefined || Math.hypot(b.x - a.x, b.y - a.y) > TELEPORT_CELLS) return a;
  return { ...a, x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

// (dx, dy) é unitário. Interpolar o vetor direto encolhe ele no meio do giro, e num giro de 180°
// passa pelo zero; pelo ângulo não, e o delta vai pelo lado mais curto
export function lerpDirection(a: { dx: number; dy: number }, b: { dx: number; dy: number },
  t: number): { dx: number; dy: number } {
  const from = Math.atan2(a.dy, a.dx);
  let delta = Math.atan2(b.dy, b.dx) - from;
  if (delta > Math.PI) delta -= 2 * Math.PI;
  else if (delta < -Math.PI) delta += 2 * Math.PI;
  const angle = from + delta * t;
  return { dx: Math.cos(angle), dy: Math.sin(angle) };
}

function lerpPlayer(a: PlayerSnapshot, b: PlayerSnapshot | undefined, t: number): PlayerSnapshot {
  // morreu ou renasceu entre os dois: no pvp o respawn é em outro lugar
  if (b === undefined || b.alive !== a.alive) return a;
  const moved = lerpPoint(a, b, t);
  return moved === a ? a : { ...moved, ...lerpDirection(a, b, t) };
}

// Parte do Snapshot mais antigo: o que existe, o estado e o HP são os do instante desenhado.
// Quem acabou de nascer espera o instante chegar; quem sumiu fica parado até lá
function byId<T>(from: T[], to: T[], key: (item: T) => string | number,
  mix: (a: T, b: T | undefined) => T): T[] {
  const next = new Map(to.map((item) => [key(item), item]));
  return from.map((item) => mix(item, next.get(key(item))));
}

function between(a: Snapshot, b: Snapshot, t: number, userId: number): Interpolated {
  return {
    otherPlayers: byId(a.players.filter((player) => player.id !== userId), b.players,
      (player) => player.id, (pa, pb) => lerpPlayer(pa, pb, t)),
    enemies: byId(a.enemies, b.enemies, (enemy) => enemy.id, (ea, eb) => lerpPoint(ea, eb, t)),
    boss: a.boss === null ? null : lerpPoint(a.boss, b.boss ?? undefined, t),
    projectiles: byId(a.projectiles, b.projectiles, (projectile) => projectile.id,
      (pa, pb) => lerpPoint(pa, pb, t)),
  };
}

export function createInterpolator(userId: number): Interpolator {
  const buffer: Entry[] = [];
  let lagMs: number | null = null; // quanto o relógio local está à frente do tick do servidor
  return {
    push(snapshot, atMs) {
      const tickMs = snapshot.tick * TICK_MS;
      const lag = atMs - tickMs;
      lagMs = lagMs === null || lag < lagMs ? lag : lagMs + (lag - lagMs) * LAG_RISE;
      buffer.push({ tickMs, snapshot });
      if (buffer.length > BUFFER_MAX) buffer.shift();
    },
    sample(nowMs) {
      if (buffer.length === 0 || lagMs === null) return null;
      const renderMs = nowMs - lagMs - INTERP_DELAY_MS; // no relógio do servidor
      // fica um só Snapshot antes do instante desenhado, o "de"; o seguinte é o "para"
      while (buffer.length > 1 && buffer[1].tickMs <= renderMs) buffer.shift();
      const [from, to = from] = buffer;
      // sem "para" (nada chegou depois do instante), t = 0 no último: congela, não extrapola
      const span = to.tickMs - from.tickMs;
      const t = span <= 0 ? 0 : Math.max(0, (renderMs - from.tickMs) / span);
      return between(from.snapshot, to.snapshot, t, userId);
    },
  };
}
