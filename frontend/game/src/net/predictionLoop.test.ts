import { beforeEach, expect, test } from "vitest";
import { PLAYER_SPEED, TICK_RATE } from "../rules";
import type { ClientMessage, Keys, PlayerSnapshot, Snapshot, WelcomeMessage } from "../types";
import { createPredictionLoop, MAX_STEPS_PER_FRAME, type PredictionLoop } from "./predictionLoop";

const STEP_S = 1 / TICK_RATE;
const NONE: Keys = { up: false, down: false, left: false, right: false,
  rot_left: false, rot_right: false, sprint: false };
const UP: Keys = { ...NONE, up: true };

// sala 6x6 vazia; o Player 7 no meio, olhando para o norte
const WELCOME = {
  v: 1, type: "welcome", user_id: 7,
  room: { match_id: 1, mode: "coop", map: "test",
    options: { theme: "dungeon", start_hp: 10, pickups: { potion: true, mana: true, armor: true } } },
  map: { grid: ["111111", "100001", "100001", "100001", "100001", "111111"] },
  snapshot: { tick: 0, last_input_seq: 0, enemies: [], boss: null, projectiles: [], doors: [],
    grid_delta: [], scoreboard: null,
    players: [{ id: 7, name: "ana", x: 2.5, y: 2.5, dx: 0, dy: -1, hp: 10, mana: 100, armor: 0,
      keys: 0, alive: true, connected: true }] },
} satisfies WelcomeMessage;

let sent: ClientMessage[];
let loop: PredictionLoop;

beforeEach(() => {
  sent = [];
  loop = createPredictionLoop((message) => sent.push(message));
  loop.start(WELCOME);
});

const inputs = () => sent.filter((message) => message.type === "input");

test("a 50 ms frame sends 1 Input and keeps the rest", () => {
  loop.frame(0.05, NONE, 0);
  expect(inputs()).toHaveLength(1);
  loop.frame(0.02, NONE, 0); // 16,7 ms de sobra + 20 ms passam de um passo
  expect(inputs()).toHaveLength(2);
});

test("a 100 ms frame sends 3 Inputs", () => {
  loop.frame(0.1, NONE, 0);
  expect(inputs()).toHaveLength(3);
});

test("seq starts at 1 and Action shares the counter", () => {
  loop.frame(STEP_S, NONE, 0);
  loop.action("fire");
  loop.frame(STEP_S, NONE, 0);
  expect(sent.map((message) => "seq" in message && message.seq)).toEqual([1, 2, 3]);
  expect(sent.map((message) => message.type)).toEqual(["input", "action", "input"]);
});

test("mouse_dx between two steps goes whole into the next Input", () => {
  loop.frame(0.01, NONE, 0.2); // sem passo ainda
  loop.frame(0.03, NONE, 0.1);
  loop.frame(0.1, NONE, 0.5); // 3 passos: o giro vai no primeiro, os outros levam 0
  expect(inputs().map((input) => input.mouse_dx)).toEqual(
    [expect.closeTo(0.3), 0.5, 0, 0]);
});

test("a very long frame sends at most MAX_STEPS_PER_FRAME and drops the rest", () => {
  loop.frame(2.0, NONE, 0);
  expect(inputs()).toHaveLength(MAX_STEPS_PER_FRAME);
  loop.frame(0.02, NONE, 0); // a sobra foi descartada: 20 ms não fecham um passo
  expect(inputs()).toHaveLength(MAX_STEPS_PER_FRAME);
});

test("localPlayer halfway between two steps is halfway between them", () => {
  loop.frame(STEP_S, UP, 0); // 1 passo: de 2,5 para 2,38
  expect(loop.localPlayer()?.y).toBeCloseTo(2.5); // alpha 0: ainda no passo anterior
  loop.frame(STEP_S / 2, UP, 0);
  expect(loop.localPlayer()?.y).toBeCloseTo(2.44);
});

test("nothing is sent before start", () => {
  const idle = createPredictionLoop((message) => sent.push(message));
  sent = [];
  idle.frame(0.1, UP, 0);
  idle.action("door");
  expect(sent).toEqual([]);
  expect(idle.localPlayer()).toBeNull();
});

const STEP = PLAYER_SPEED / TICK_RATE;

function snapshotAfter(
  lastInputSeq: number,
  changes: Partial<PlayerSnapshot> = {},
): Snapshot {
  return {
    ...WELCOME.snapshot,
    tick: 2,
    last_input_seq: lastInputSeq,
    players: [{ ...WELCOME.snapshot.players[0], ...changes }],
  };
}

test("confirmation preserves the rendered position without resending Inputs", () => {
  loop.frame(3.5 * STEP_S, UP, 0);
  const expectedY = 2.5 - 2.5 * STEP;
  expect(loop.localPlayer()?.y).toBeCloseTo(expectedY);
  const count = sent.length;

  loop.onSnapshot(snapshotAfter(1, { y: 2.5 - STEP }));

  expect(loop.localPlayer()?.y).toBeCloseTo(expectedY);
  expect(sent).toHaveLength(count);
});

test("fully confirmed Inputs are not replayed on later Snapshots", () => {
  loop.frame(3 * STEP_S, UP, 0);
  loop.onSnapshot(snapshotAfter(3, { y: 2.5 - 3 * STEP }));
  loop.onSnapshot(snapshotAfter(3, { x: 3, y: 3, hp: 7 }));
  loop.frame(STEP_S, NONE, 0);

  expect(loop.localPlayer()).toMatchObject({ x: 3, y: 3, hp: 7 });
});

test("a correction starts from the official pose and reapplies pending Inputs", () => {
  loop.frame(2 * STEP_S, UP, 0);
  loop.onSnapshot(snapshotAfter(1, { x: 3, y: 3 }));
  loop.frame(STEP_S, NONE, 0);

  expect(loop.localPlayer()?.x).toBeCloseTo(3);
  expect(loop.localPlayer()?.y).toBeCloseTo(3 - STEP);
});

test("an opened Door changes collisions before replaying pending Inputs", () => {
  const welcome: WelcomeMessage = structuredClone(WELCOME);
  welcome.map.grid[1] = "10D001";
  welcome.snapshot.players[0].y = 2.1;
  welcome.snapshot.doors = [{ x: 2, y: 1, open: false, locked: true }];
  loop.start(welcome);
  loop.frame(STEP_S, UP, 0);
  expect(loop.localPlayer()?.y).toBeCloseTo(2.1);

  loop.onSnapshot({
    ...welcome.snapshot,
    tick: 2,
    doors: [{ x: 2, y: 1, open: true, locked: false }],
    grid_delta: [{ x: 2, y: 1, c: "O" }],
  });
  loop.frame(STEP_S, NONE, 0);

  expect(loop.localPlayer()?.y).toBeCloseTo(2.1 - STEP);
  expect(welcome.map.grid[1]).toBe("10D001");
});

test("welcome applies existing grid_delta before the first predicted Input", () => {
  const welcome: WelcomeMessage = structuredClone(WELCOME);
  welcome.map.grid[1] = "10D001";
  welcome.snapshot.players[0].y = 2.1;
  welcome.snapshot.doors = [{ x: 2, y: 1, open: true, locked: false }];
  welcome.snapshot.grid_delta = [{ x: 2, y: 1, c: "O" }];
  loop.start(welcome);
  loop.frame(1.5 * STEP_S, UP, 0);

  expect(loop.localPlayer()?.y).toBeCloseTo(2.1 - STEP / 2);
});

test.each(["Player", "Enemy", "Boss"])(
  "%s blocks while alive and stops blocking after death",
  kind => {
    const blocked = snapshotAfter(0);
    const cleared = snapshotAfter(1);

    if (kind === "Player") {
      const other = {
        ...WELCOME.snapshot.players[0],
        id: 9, y: 1.9, connected: false,
      };
      blocked.players.push(other);
      cleared.players.push({ ...other, alive: false, hp: 0 });
    } else if (kind === "Enemy") {
      blocked.enemies = [{ id: "e_1", x: 2.5, y: 1.9, state: "alert" }];
      cleared.enemies = [{ id: "e_1", x: 2.5, y: 1.9, state: "dying" }];
    } else {
      blocked.boss = { x: 2.5, y: 1.9, hp: 60, state: "idle" };
      cleared.boss = { x: 2.5, y: 1.9, hp: 0, state: "dying" };
    }

    loop.onSnapshot(blocked);
    loop.frame(STEP_S, UP, 0);
    expect(loop.localPlayer()?.y).toBeCloseTo(2.5);

    loop.onSnapshot(cleared);
    loop.frame(1.5 * STEP_S, UP, 0);
    expect(loop.localPlayer()?.y).toBeCloseTo(2.5 - STEP / 2);
  },
);

test("death stops movement and rotation while Inputs keep being sent", () => {
  loop.frame(STEP_S, UP, 0);
  loop.onSnapshot(snapshotAfter(1, {
    x: 3, y: 3, hp: 0, alive: false,
  }));
  loop.frame(1.5 * STEP_S, UP, 0.2);

  expect(loop.localPlayer()).toMatchObject({
    x: 3, y: 3, dx: 0, dy: -1, hp: 0, alive: false,
  });
  expect(inputs().at(-1)).toMatchObject({ seq: 2 });
});

test("a new welcome resets pending Inputs, Seq, mouse and accumulated time", () => {
  loop.frame(STEP_S, UP, 0);
  loop.frame(0.75 * STEP_S, NONE, 0.2);
  const count = sent.length;
  const welcome: WelcomeMessage = structuredClone(WELCOME);
  welcome.snapshot.players[0].x = 3;
  welcome.snapshot.players[0].y = 3;

  loop.start(welcome);
  loop.onSnapshot(welcome.snapshot);
  loop.frame(STEP_S / 2, NONE, 0);
  expect(sent).toHaveLength(count);
  loop.frame(STEP_S / 2, NONE, 0);

  expect(inputs().at(-1)).toMatchObject({ seq: 1, mouse_dx: 0 });
  expect(loop.localPlayer()).toMatchObject({
    x: 3, y: 3, dx: 0, dy: -1,
  });
});
