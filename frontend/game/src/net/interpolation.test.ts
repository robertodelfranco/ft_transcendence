import { expect, test } from "vitest";
import { TICK_RATE } from "../rules";
import type { EnemySnapshot, PlayerSnapshot, ProjectileSnapshot, Snapshot } from "../types";
import { createInterpolator, INTERP_DELAY_MS, lerpDirection,
  type Interpolator } from "./interpolation";

const ME = 1;
const OTHER = 2;
const TICK_MS = 1000 / TICK_RATE;
const GAP_MS = 2 * TICK_MS; // um Snapshot a cada 2 Ticks

const player = (id: number, extra: Partial<PlayerSnapshot> = {}): PlayerSnapshot => ({
  id, name: `p${id}`, x: 1.5, y: 1.5, dx: 1, dy: 0, hp: 10, mana: 100, armor: 0, keys: 0,
  alive: true, connected: true, ...extra });

const snapshot = (tick: number, players: PlayerSnapshot[], extra: Partial<Snapshot> = {}): Snapshot => ({
  tick, last_input_seq: 0, players, enemies: [], boss: null, projectiles: [], doors: [],
  grid_delta: [], scoreboard: null, ...extra });

const enemy = (id: string, x: number): EnemySnapshot => ({ id, x, y: 1.5, state: "alert" });

const fireball = (x: number): ProjectileSnapshot => ({ id: "f1", kind: "fireball", owner: OTHER,
  x, y: 1.5, dx: 1, dy: 0, state: "moving" });

const fromAngle = (deg: number) => ({ dx: Math.cos(deg * Math.PI / 180),
  dy: Math.sin(deg * Math.PI / 180) });

// o outro Player vai de a (tick 0) para b (tick 2), chegando sem atraso
function moving(a: Partial<PlayerSnapshot>, b: Partial<PlayerSnapshot>): Interpolator {
  const interp = createInterpolator(ME);
  interp.push(snapshot(0, [player(ME), player(OTHER, a)]), 0);
  interp.push(snapshot(2, [player(ME), player(OTHER, b)]), GAP_MS);
  return interp;
}

const other = (interp: Interpolator, nowMs: number) => interp.sample(nowMs)!.otherPlayers[0];

test("nothing to draw before the first Snapshot", () => {
  expect(createInterpolator(ME).sample(0)).toBeNull();
});

test("the others are drawn 100 ms behind, between the two Snapshots around that instant", () => {
  const interp = moving({ x: 1 }, { x: 2 });
  expect(other(interp, INTERP_DELAY_MS).x).toBeCloseTo(1);
  expect(other(interp, INTERP_DELAY_MS + GAP_MS / 4).x).toBeCloseTo(1.25);
  expect(other(interp, INTERP_DELAY_MS + GAP_MS / 2).x).toBeCloseTo(1.5);
});

test("before the first Snapshot's instant it stays on the first", () => {
  expect(other(moving({ x: 1 }, { x: 2 }), 0).x).toBe(1);
});

test("the local Player is left to the Prediction", () => {
  const ids = moving({}, {}).sample(INTERP_DELAY_MS)!.otherPlayers.map((p) => p.id);
  expect(ids).toEqual([OTHER]);
});

test("without a new Snapshot it freezes on the last one instead of extrapolating", () => {
  const interp = moving({ x: 1 }, { x: 2 });
  expect(other(interp, INTERP_DELAY_MS + 3 * GAP_MS).x).toBe(2);
  expect(other(interp, INTERP_DELAY_MS + 10 * GAP_MS).x).toBe(2);
});

test("Snapshots that arrive together after a late one keep their server spacing", () => {
  // tick 4 segurado pela retransmissão do TCP e entregue junto do tick 6
  const interp = createInterpolator(ME);
  const at = (tick: number, arrivalMs: number) =>
    interp.push(snapshot(tick, [player(ME), player(OTHER, { x: tick / 2 })]), arrivalMs);
  at(0, 1);
  at(2, GAP_MS + 1);
  at(4, 200);
  at(6, 201);
  // o atraso medido é o do Snapshot mais rápido, 1 ms: o outro anda reto pelo tempo do servidor
  const expected = (nowMs: number) => (nowMs - 1 - INTERP_DELAY_MS) / TICK_MS / 2;
  for (const nowMs of [250, 260, 270, 280, 290]) {
    expect(other(interp, nowMs).x).toBeCloseTo(expected(nowMs), 5);
  }
});

test("a jump bigger than TELEPORT_CELLS is not slid across", () => {
  const interp = moving({ x: 1 }, { x: 9 });
  expect(other(interp, INTERP_DELAY_MS + GAP_MS / 2).x).toBe(1);
  expect(other(interp, INTERP_DELAY_MS + GAP_MS + 1).x).toBe(9);
});

test("a respawn is not slid across, even a near one", () => {
  const halfway = other(moving({ x: 1, alive: false }, { x: 2 }), INTERP_DELAY_MS + GAP_MS / 2);
  expect(halfway).toMatchObject({ x: 1, alive: false });
});

test("a Player turning in place turns smoothly", () => {
  const halfway = other(moving(fromAngle(0), fromAngle(90)), INTERP_DELAY_MS + GAP_MS / 2);
  expect(halfway.x).toBe(1.5);
  expect(Math.atan2(halfway.dy, halfway.dx)).toBeCloseTo(Math.PI / 4);
});

test("the angle turns by the shortest side", () => {
  // de 170° para -170° são 20° passando por 180°, não 340° passando por 0°
  const mid = lerpDirection(fromAngle(170), fromAngle(-170), 0.5);
  expect(mid.dx).toBeCloseTo(-1);
  expect(mid.dy).toBeCloseTo(0);
});

test("the direction keeps unit length halfway through a turn", () => {
  const mid = lerpDirection(fromAngle(0), fromAngle(90), 0.5);
  expect(Math.hypot(mid.dx, mid.dy)).toBeCloseTo(1);
});

test("Enemies use the same buffer: the newborn waits for its instant, the gone one stays", () => {
  const interp = createInterpolator(ME);
  interp.push(snapshot(0, [player(ME)], { enemies: [enemy("a", 1), enemy("gone", 5)] }), 0);
  interp.push(snapshot(2, [player(ME)], { enemies: [enemy("a", 2), enemy("new", 7)] }), GAP_MS);
  const halfway = interp.sample(INTERP_DELAY_MS + GAP_MS / 2)!.enemies;
  expect(halfway.map((e) => e.id)).toEqual(["a", "gone"]);
  expect(halfway[0].x).toBeCloseTo(1.5);
  const after = interp.sample(INTERP_DELAY_MS + GAP_MS + 1)!.enemies;
  expect(after.map((e) => e.id)).toEqual(["a", "new"]);
});

test("the Boss and the Projectiles slide like the Enemies", () => {
  const boss = (x: number) => ({ x, y: 1.5, hp: 60, state: "alert" as const });
  const interp = createInterpolator(ME);
  interp.push(snapshot(0, [player(ME)], { boss: boss(1), projectiles: [fireball(1)] }), 0);
  interp.push(snapshot(2, [player(ME)], { boss: boss(2), projectiles: [fireball(1.8)] }), GAP_MS);
  const halfway = interp.sample(INTERP_DELAY_MS + GAP_MS / 2)!;
  expect(halfway.boss?.x).toBeCloseTo(1.5);
  expect(halfway.projectiles[0].x).toBeCloseTo(1.4);
});
