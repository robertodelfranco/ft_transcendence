import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { EndResult, HudState, MountedGame } from "./api";
import { createMountGame, type SceneRenderer } from "./mount";
import type { ViewState } from "./net/viewstate";
import type { WebSocketLike } from "./net/socket";
import { BOSS_DYING_S } from "./rules";
import type { WelcomeMessage } from "./types";

class FakeWebSocket implements WebSocketLike {
  readyState = 0;
  sent: Array<{ type: string }> = [];
  onopen: WebSocketLike["onopen"] = null;
  onmessage: WebSocketLike["onmessage"] = null;
  onclose: WebSocketLike["onclose"] = null;
  onerror: WebSocketLike["onerror"] = null;
  send(data: string) { this.sent.push(JSON.parse(data)); }
  close() { this.readyState = 3; }
  open() { this.readyState = 1; this.onopen?.call(this as never, new Event("open")); }
  receive(message: object) {
    this.onmessage?.call(this as never, new MessageEvent("message", { data: JSON.stringify(message) }));
  }
  drop(code: number) {
    this.readyState = 3;
    this.onclose?.call(this as never, new CloseEvent("close", { code }));
  }
}

class FakeRenderer implements SceneRenderer {
  inits = 0;
  views: ViewState[] = [];
  disposed = false;
  failInit = false;
  async init() {
    this.inits += 1;
    if (this.failInit) throw new Error("asset_load_failed");
  }
  render(view: ViewState) { this.views.push(view); }
  resize() {}
  dispose() { this.disposed = true; }
}

const WELCOME = {
  v: 1, type: "welcome", user_id: 7,
  room: { match_id: 12, mode: "coop", map: "test",
    options: { theme: "dungeon", start_hp: 10, pickups: { potion: true, mana: true, armor: true } } },
  map: { grid: ["11111", "10001", "10001", "11111"] },
  snapshot: { tick: 0, last_input_seq: 0, enemies: [], boss: null, projectiles: [], doors: [],
    grid_delta: [], scoreboard: null,
    players: [{ id: 7, name: "ana", x: 1.5, y: 1.5, dx: 0, dy: -1, hp: 10, mana: 100, armor: 0,
      keys: 0, alive: true, connected: true }] },
} satisfies WelcomeMessage;

let ws: FakeWebSocket;
let renderer: FakeRenderer;
let huds: HudState[];
let ends: EndResult[];
let game: MountedGame;
let frames: Array<(now: number) => void>;

const lastHud = () => huds[huds.length - 1];

async function runFrame(nowMs: number): Promise<void> {
  const callbacks = frames;
  frames = [];
  callbacks.forEach((callback) => callback(nowMs));
  await vi.advanceTimersByTimeAsync(0);
}

async function connect(): Promise<void> {
  ws.open();
  await vi.advanceTimersByTimeAsync(0);
  ws.receive(WELCOME);
  await vi.advanceTimersByTimeAsync(0); // o init do Renderer resolve
}

beforeEach(() => {
  vi.useFakeTimers();
  frames = [];
  vi.stubGlobal("requestAnimationFrame", (callback: (now: number) => void) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => { frames = []; });
  renderer = new FakeRenderer();
  huds = [];
  ends = [];
  const mountGame = createMountGame({
    createRenderer: () => renderer,
    createWebSocket: () => (ws = new FakeWebSocket()),
  });
  game = mountGame(document.createElement("canvas"), {
    matchId: 12, getAccessToken: async () => "token",
    onHud: (hud) => huds.push(hud), onEnd: (end) => ends.push(end), wsUrl: "ws://test",
  });
});

afterEach(() => {
  game.unmount();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test("the HUD starts connecting and turns running on welcome", async () => {
  expect(huds[0].status).toBe("connecting");
  await connect();
  expect(lastHud()).toMatchObject({ status: "running", hp: 10, maxHp: 10 });
  expect(ws.sent[0].type).toBe("join");
});

test("frames send Inputs and draw the Player where the server put it", async () => {
  await connect();
  await runFrame(0);
  await runFrame(100);
  expect(ws.sent.filter((message) => message.type === "input")).toHaveLength(3);
  expect(renderer.views.at(-1)?.localPlayer).toMatchObject({ x: 1.5, y: 1.5 });
  ws.receive({ v: 1, type: "snapshot", ...WELCOME.snapshot, tick: 2,
    players: [{ ...WELCOME.snapshot.players[0], x: 2 }] });
  await runFrame(116);
  expect(renderer.views.at(-1)?.localPlayer.x).toBe(2);
});

test("a second welcome after a reconnection does not init the Renderer again", async () => {
  await connect();
  ws.drop(1006);
  expect(lastHud().status).toBe("disconnected");
  await vi.advanceTimersByTimeAsync(1200);
  await connect();
  expect(renderer.inits).toBe(1);
  expect(lastHud().status).toBe("running");
});

test("game_over calls onEnd once, after the Boss dying animation", async () => {
  await connect();
  const over = { v: 1, type: "event", tick: 90, name: "game_over",
    data: { result: "win", winner_ids: [7], reason: "boss_defeated" } };
  ws.receive(over);
  ws.receive(over);
  await vi.advanceTimersByTimeAsync(BOSS_DYING_S * 1000 - 1);
  expect(ends).toEqual([]);
  await vi.advanceTimersByTimeAsync(1);
  expect(ends).toEqual([{ result: "win", winnerIds: [7], reason: "boss_defeated" }]);
  expect(lastHud().status).toBe("finished");
});

test("a drop after game_over does not reconnect nor hide the end", async () => {
  await connect();
  const first = ws;
  ws.receive({ v: 1, type: "event", tick: 90, name: "game_over",
    data: { result: "loss", winner_ids: [], reason: "all_dead" } });
  ws.drop(1006);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(ws).toBe(first);
  expect(ends).toHaveLength(1);
  expect(lastHud().status).toBe("finished");
  expect(huds.some((hud) => hud.status === "error" || hud.status === "disconnected")).toBe(false);
});

test("a welcome emits one HUD and an unchanged Snapshot emits none", async () => {
  await connect();
  const count = huds.length;
  expect(huds.filter((hud) => hud.status === "running")).toHaveLength(1);
  ws.receive({ v: 1, type: "snapshot", ...WELCOME.snapshot, tick: 2 });
  expect(huds).toHaveLength(count);
  ws.receive({ v: 1, type: "snapshot", ...WELCOME.snapshot, tick: 4,
    players: [{ ...WELCOME.snapshot.players[0], hp: 8 }] });
  expect(huds).toHaveLength(count + 1);
});

test("a malformed Snapshot becomes invalid_message instead of an exception", async () => {
  await connect();
  ws.receive({ v: 1, type: "snapshot", tick: 2 });
  expect(lastHud()).toMatchObject({ status: "error", error: "invalid_message" });
});

test("player_died feeds the killfeed", async () => {
  await connect();
  ws.receive({ v: 1, type: "event", tick: 40, name: "player_died", data: { player_id: 7, by: null } });
  ws.receive({ v: 1, type: "snapshot", ...WELCOME.snapshot, tick: 42 });
  expect(lastHud().killfeed).toEqual([{ by: null, victim: 7, tick: 40 }]);
});

test("a refused join shows the error code and stops", async () => {
  ws.open();
  ws.drop(4404);
  expect(lastHud()).toMatchObject({ status: "error", error: "room_not_found" });
});

test("a Renderer that fails to load shows asset_load_failed", async () => {
  renderer.failInit = true;
  await connect();
  expect(lastHud()).toMatchObject({ status: "error", error: "asset_load_failed" });
});

test("unmount releases everything and is safe to call twice", async () => {
  await connect();
  game.unmount();
  game.unmount();
  expect(renderer.disposed).toBe(true);
  expect(ws.readyState).toBe(3);
  expect(frames).toEqual([]);
  const count = huds.length;
  ws.receive({ v: 1, type: "snapshot", ...WELCOME.snapshot, tick: 4 });
  expect(huds).toHaveLength(count);
});

test("frames draw predicted movement before a new Snapshot arrives", async () => {
  await connect();
  await runFrame(0);
  window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW" }));
  await runFrame(100);
  window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyW" }));

  const view = renderer.views.at(-1);
  expect(view?.localPlayer.y).toBeLessThan(1.5);
  expect(view?.camera.y).toBe(view?.localPlayer.y);
  expect(lastHud().hp).toBe(10);
});

test("a Snapshot corrects the pose while preserving unconfirmed movement", async () => {
  await connect();
  await runFrame(0);
  window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW" }));
  await runFrame(100);
  window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyW" }));

  ws.receive({
    v: 1, type: "snapshot", ...WELCOME.snapshot,
    tick: 2, last_input_seq: 1,
    players: [{ ...WELCOME.snapshot.players[0], x: 2.5, hp: 7 }],
  });
  await runFrame(116);

  const view = renderer.views.at(-1);
  expect(view?.localPlayer.x).toBeCloseTo(2.5);
  expect(view?.localPlayer.y).toBeLessThan(1.5);
  expect(view?.camera.y).toBe(view?.localPlayer.y);
  expect(lastHud().hp).toBe(7);
});

test("a dead coop Player watches a living teammate", async () => {
  await connect();
  ws.receive({
    v: 1, type: "snapshot", ...WELCOME.snapshot, tick: 2,
    players: [
      { ...WELCOME.snapshot.players[0], alive: false, hp: 0 },
      { ...WELCOME.snapshot.players[0], id: 9, x: 2.5, y: 2.5 },
    ],
  });
  await runFrame(0);

  const view = renderer.views.at(-1);
  expect(view?.localPlayer).toMatchObject({ id: 7, alive: false, hp: 0 });
  expect(view?.camera).toMatchObject({ x: 2.5, y: 2.5 });
});

test("game_over draws the final authoritative pose without pending movement", async () => {
  await connect();
  await runFrame(0);
  window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW" }));
  await runFrame(100);
  window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyW" }));

  ws.receive({
    v: 1, type: "event", tick: 4, name: "game_over",
    data: { result: "win", winner_ids: [7], reason: "boss_defeated" },
  });
  ws.receive({
    v: 1, type: "snapshot", ...WELCOME.snapshot,
    tick: 4, last_input_seq: 1,
    players: [{ ...WELCOME.snapshot.players[0], x: 2, y: 2 }],
  });
  await runFrame(116);

  const view = renderer.views.at(-1);
  expect(view?.localPlayer).toMatchObject({ x: 2, y: 2 });
  expect(view?.camera).toMatchObject({ x: 2, y: 2 });
});
