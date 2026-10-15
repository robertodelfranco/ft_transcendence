import { expect, test } from "vitest";
import mirrorJson from "../fixtures/mirror.json";
import { applyInput, type Body, type CollisionWorld } from "./applyInput";
import type { Keys } from "./types";

interface MirrorCase {
  name: string;
  start: Body;
  bodies: number[][]; // o JSON não sabe que cada corpo é um par
  runs: { keys: (keyof Keys)[]; mouse_dx: number; ticks: number }[];
  end: Body;
}

// o JSON chega com tipos inferidos (keys: string[]); o cast diz o formato que o mirror.py grava
const mirror = mirrorJson as { dt: number; grid: string[]; cases: MirrorCase[] };

// sin e cos podem diferir no último bit entre Python e V8; 1e-9 cobre isso com folga
// e ainda acusa fórmula errada (roadmap R5, "Aprender antes")
const DIGITS = 9;

function keysOf(pressed: (keyof Keys)[]): Keys {
  return {
    up: pressed.includes("up"), down: pressed.includes("down"),
    left: pressed.includes("left"), right: pressed.includes("right"),
    rot_left: pressed.includes("rot_left"), rot_right: pressed.includes("rot_right"),
    sprint: pressed.includes("sprint"),
  };
}

test.each(mirror.cases)("$name ends where sim.py ends", (mirrorCase) => {
  const bodies = mirrorCase.bodies.map(([x, y]) => [x, y] as const);
  const world: CollisionWorld = { grid: mirror.grid, bodies };
  let body = mirrorCase.start;
  for (const run of mirrorCase.runs) {
    const input = { keys: keysOf(run.keys), mouse_dx: run.mouse_dx };
    for (let tick = 0; tick < run.ticks; tick++) body = applyInput(body, input, world, mirror.dt);
  }
  expect(body.x).toBeCloseTo(mirrorCase.end.x, DIGITS);
  expect(body.y).toBeCloseTo(mirrorCase.end.y, DIGITS);
  expect(body.angle).toBeCloseTo(mirrorCase.end.angle, DIGITS);
});
