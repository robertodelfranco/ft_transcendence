import { beforeEach, expect, test } from "vitest";
import { TICK_RATE } from "../rules";
import type { ClientMessage, Keys, WelcomeMessage } from "../types";
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
