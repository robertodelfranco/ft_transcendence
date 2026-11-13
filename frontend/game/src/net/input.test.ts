import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { ActionKind } from "../types";
import { captureInput, type InputCapture } from "./input";

let canvas: HTMLCanvasElement;
let actions: ActionKind[];
let input: InputCapture;

const press = (code: string, repeat = false) =>
  window.dispatchEvent(new KeyboardEvent("keydown", { code, repeat, cancelable: true }));
const release = (code: string) => window.dispatchEvent(new KeyboardEvent("keyup", { code }));

function lockPointer(element: Element | null): void {
  Object.defineProperty(document, "pointerLockElement", { configurable: true, get: () => element });
}

beforeEach(() => {
  canvas = document.createElement("canvas");
  actions = [];
  input = captureInput(canvas, (kind) => actions.push(kind), 0.01);
});

afterEach(() => {
  input.dispose();
  lockPointer(null);
  vi.restoreAllMocks();
});

test("WASD, arrows and Shift set the matching keys", () => {
  for (const code of ["KeyW", "KeyD", "ArrowLeft", "ShiftLeft"]) press(code);
  expect(input.keys).toEqual({ up: true, down: false, left: false, right: true,
    rot_left: true, rot_right: false, sprint: true });
  release("KeyW");
  expect(input.keys.up).toBe(false);
});

test("Space starts charging, fires on release, and F opens once per press", () => {
  press("Space");
  press("Space", true);
  press("KeyF");
  expect(actions).toEqual(["charge_start", "door"]);
  release("Space");
  release("Space");
  expect(actions).toEqual(["charge_start", "door", "fire"]);
});

test("game keys do not scroll the page, others pass through", () => {
  const space = new KeyboardEvent("keydown", { code: "Space", cancelable: true });
  const tab = new KeyboardEvent("keydown", { code: "Tab", cancelable: true });
  window.dispatchEvent(space);
  window.dispatchEvent(tab);
  expect(space.defaultPrevented).toBe(true);
  expect(tab.defaultPrevented).toBe(false);
});

test("typing in a text field neither moves, fires nor blocks the space", () => {
  const field = document.createElement("input");
  document.body.append(field);
  const space = new KeyboardEvent("keydown", { code: "Space", bubbles: true, cancelable: true });
  field.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW", bubbles: true }));
  field.dispatchEvent(space);
  field.remove();
  expect(input.keys.up).toBe(false);
  expect(actions).toEqual([]);
  expect(space.defaultPrevented).toBe(false);
});

test("space on a focused shell button neither fires nor is blocked", () => {
  const button = document.createElement("button");
  document.body.append(button);
  const space = new KeyboardEvent("keydown", { code: "Space", bubbles: true, cancelable: true });
  button.dispatchEvent(space);
  button.remove();
  expect(actions).toEqual([]);
  expect(space.defaultPrevented).toBe(false);
});

test("losing focus releases every key", () => {
  press("KeyW");
  press("ShiftLeft");
  window.dispatchEvent(new Event("blur"));
  expect(Object.values(input.keys)).not.toContain(true);
});

test("mouse turns only while the pointer is locked, and is taken once", () => {
  document.dispatchEvent(new MouseEvent("mousemove", { movementX: 10 }));
  lockPointer(canvas);
  document.dispatchEvent(new MouseEvent("mousemove", { movementX: 10 }));
  document.dispatchEvent(new MouseEvent("mousemove", { movementX: -4 }));
  expect(input.takeMouseDx()).toBeCloseTo(0.06);
  expect(input.takeMouseDx()).toBe(0);
});

test("after dispose nothing is read", () => {
  input.dispose();
  press("KeyW");
  press("Space");
  expect(input.keys.up).toBe(false);
  expect(actions).toEqual([]);
});


test("charge continues past three seconds until Space is released", () => {
  const clock = vi.spyOn(performance, "now").mockReturnValue(0);
  press("Space");
  clock.mockReturnValue(5000);
  expect(input.chargeSeconds).toBe(5);
  expect(actions).toEqual(["charge_start"]);
  release("Space");
  expect(input.chargeSeconds).toBeNull();
  expect(actions).toEqual(["charge_start", "fire"]);
  clock.mockRestore();
});

test("blur cancels charge without firing on subsequent release", () => {
  press("Space");
  window.dispatchEvent(new Event("blur"));
  release("Space");
  expect(input.chargeSeconds).toBeNull();
  expect(actions).toEqual(["charge_start", "charge_cancel"]);
});

test("unlocking the pointer cancels charge", () => {
  lockPointer(canvas);
  press("Space");
  lockPointer(null);
  document.dispatchEvent(new Event("pointerlockchange"));
  release("Space");
  expect(actions).toEqual(["charge_start", "charge_cancel"]);
});

test("cannot start charging while dead or frozen", () => {
  input.dispose();
  input = captureInput(canvas, kind => actions.push(kind), 0.01, () => false);
  press("Space");
  release("Space");
  expect(input.chargeSeconds).toBeNull();
  expect(actions).toEqual([]);
});
