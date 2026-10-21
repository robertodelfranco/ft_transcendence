import { expect, test } from "vitest";
import type { CollisionWorld, MoveInput } from "../applyInput";
import { PLAYER_SPEED, TICK_RATE } from "../rules";
import type { PlayerSnapshot } from "../types";
import { reconcilePlayer, type PendingInput } from "./reconciliation";

const STEP = PLAYER_SPEED / TICK_RATE;

const PLAYER: PlayerSnapshot = {
  id: 7, name: "ana", x: 2.5, y: 2.5, dx: 0, dy: -1,
  hp: 10, mana: 100, armor: 0, keys: 0,
  alive: true, connected: true,
};

const WORLD: CollisionWorld = {
  grid: ["111111", "100001", "100001", "100001", "100001", "111111"],
  bodies: [],
};

const UP: MoveInput = {
  keys: {
    up: true, down: false, left: false, right: false,
    rot_left: false, rot_right: false, sprint: false,
  },
  mouse_dx: 0,
};

const PENDING: PendingInput[] = [1, 2, 3].map(seq => ({
  seq, input: UP,
}));

test("partial confirmation preserves the predicted position", () => {
  const official = { ...PLAYER, y: PLAYER.y - STEP };
  const result = reconcilePlayer(official, 1, PENDING, WORLD);

  expect(result.pending.map(item => item.seq)).toEqual([2, 3]);
  expect(result.body.x).toBeCloseTo(PLAYER.x);
  expect(result.body.y).toBeCloseTo(PLAYER.y - 3 * STEP);
});

test("full confirmation clears pending Inputs and keeps the official pose", () => {
  const official = { ...PLAYER, x: 3, y: 3, dx: 1, dy: 0 };
  const result = reconcilePlayer(official, 3, PENDING, WORLD);

  expect(result.pending).toEqual([]);
  expect(result.body).toEqual({ x: 3, y: 3, angle: Math.PI / 2 });
});

test("a correction replays pending Inputs from the official position", () => {
  const official = { ...PLAYER, x: 3.5, y: 3.5 };
  const result = reconcilePlayer(official, 1, PENDING, WORLD);

  expect(result.body.x).toBeCloseTo(3.5);
  expect(result.body.y).toBeCloseTo(3.5 - 2 * STEP);
});

test("Seq gaps from Actions do not change which Inputs remain", () => {
  const pending = [1, 3, 4].map(seq => ({ seq, input: UP }));
  const result = reconcilePlayer(PLAYER, 3, pending, WORLD);

  expect(result.pending.map(item => item.seq)).toEqual([4]);
  expect(result.body.y).toBeCloseTo(PLAYER.y - STEP);
});

test("a dead Player stays at the official position", () => {
  const result = reconcilePlayer(
    { ...PLAYER, alive: false, hp: 0 }, 1, PENDING, WORLD,
  );

  expect(result.pending.map(item => item.seq)).toEqual([2, 3]);
  expect(result.body).toEqual({ x: PLAYER.x, y: PLAYER.y, angle: 0 });
});

test("replayed movement respects blocking bodies", () => {
  const world: CollisionWorld = {
    ...WORLD, bodies: [[PLAYER.x, PLAYER.y - 0.6]],
  };
  const result = reconcilePlayer(PLAYER, 0, [PENDING[0]], world);

  expect(result.body.x).toBeCloseTo(PLAYER.x);
  expect(result.body.y).toBeCloseTo(PLAYER.y);
});

test("reconciliation preserves its arguments", () => {
  const before = structuredClone({
    player: PLAYER, pending: PENDING, world: WORLD,
  });

  reconcilePlayer(PLAYER, 1, PENDING, WORLD);

  expect({ player: PLAYER, pending: PENDING, world: WORLD }).toEqual(before);
});
