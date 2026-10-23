import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { ErrorCode, ServerMessage } from "../types";
import { backoffMs, createGameSocket, type GameSocket, type Visibility,
  type WebSocketLike } from "./socket";

class FakeWebSocket implements WebSocketLike {
  readyState = 0;
  sent: string[] = [];
  closedWith: number | null = null;
  onopen: WebSocketLike["onopen"] = null;
  onmessage: WebSocketLike["onmessage"] = null;
  onclose: WebSocketLike["onclose"] = null;
  onerror: WebSocketLike["onerror"] = null;
  send(data: string) { this.sent.push(data); }
  close(code?: number) { this.closedWith = code ?? 1000; this.readyState = 3; }
  open() { this.readyState = 1; this.onopen?.call(this as never, new Event("open")); }
  receive(message: object | string) {
    const data = typeof message === "string" ? message : JSON.stringify(message);
    this.onmessage?.call(this as never, new MessageEvent("message", { data }));
  }
  drop(code: number) {
    this.readyState = 3;
    this.onclose?.call(this as never, new CloseEvent("close", { code }));
  }
}

class FakeVisibility extends EventTarget implements Visibility {
  hidden = false;
}

let sockets: FakeWebSocket[];
let received: ServerMessage[];
let closed: Array<ErrorCode | null>;
let reconnecting: number;
let visibility: FakeVisibility;
let tokens: Array<string | null | Error>; // Error: o getter lança
let asked: boolean[]; // o fresh de cada pedido de token
let socket: GameSocket;

const last = () => sockets[sockets.length - 1];
const flush = () => vi.advanceTimersByTimeAsync(0); // deixa o getAccessToken resolver

beforeEach(() => {
  vi.useFakeTimers();
  sockets = [];
  received = [];
  closed = [];
  reconnecting = 0;
  visibility = new FakeVisibility();
  tokens = ["token-1", "token-2"];
  asked = [];
  socket = createGameSocket({
    url: "wss://test/ws/game/12", matchId: 12,
    getAccessToken: async (fresh) => {
      asked.push(fresh);
      const token = tokens.length > 0 ? tokens.shift()! : "token-n";
      if (token instanceof Error) throw token;
      return token;
    },
    onMessage: (message) => received.push(message),
    onReconnecting: () => { reconnecting += 1; },
    onClosed: (error) => closed.push(error),
    createWebSocket: () => { const ws = new FakeWebSocket(); sockets.push(ws); return ws; },
    visibility,
    random: () => 0.5, // sem variação: as esperas ficam exatas
  });
});

afterEach(() => {
  socket.close();
  vi.useRealTimers();
});

test("the first message is join with the token", async () => {
  last().open();
  await flush();
  expect(JSON.parse(last().sent[0])).toEqual({ v: 1, type: "join", match_id: 12, token: "token-1" });
});

test("server messages reach onMessage, error does not", async () => {
  last().open();
  last().receive({ v: 1, type: "pong", t: 5 });
  last().receive({ v: 1, type: "error", code: "room_not_found", message: "x" });
  expect(received.map((message) => message.type)).toEqual(["pong"]);
});

test("invalid JSON stops without reconnecting", () => {
  last().open();
  last().receive("{nope");
  expect(closed).toEqual(["invalid_message"]);
  expect(last().closedWith).toBe(1000);
});

test.each([
  ["without v", { type: "pong", t: 1 }],
  ["with another version", { v: 2, type: "pong", t: 1 }],
  ["without type", { v: 1 }],
  ["that is not an object", 42],
])("a message %s stops as invalid_message", (_, message) => {
  last().open();
  last().receive(JSON.stringify(message));
  expect(closed).toEqual(["invalid_message"]);
  expect(received).toEqual([]);
});

test("closing while connecting waits for open, then closes without join", async () => {
  socket.close();
  expect(last().closedWith).toBeNull();
  last().open();
  await flush();
  expect(last().closedWith).toBe(1000);
  expect(last().sent).toEqual([]);
});

test("1000 is the normal end", () => {
  last().drop(1000);
  expect(closed).toEqual([null]);
});

test.each([
  [4400, "invalid_message"], [4403, "not_a_member"], [4404, "room_not_found"],
  [4408, "replaced"], [4409, "room_full"],
])("%i does not reconnect and reports %s", async (code, name) => {
  last().drop(code);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(closed).toEqual([name]);
  expect(sockets).toHaveLength(1);
});

test("4401 asks for a new token once and reconnects right away", async () => {
  last().open();
  await flush();
  last().drop(4401);
  expect(sockets).toHaveLength(2);
  last().open();
  await flush();
  expect(JSON.parse(last().sent[0]).token).toBe("token-2");
  last().drop(4401);
  expect(closed).toEqual(["unauthenticated"]);
});

test("only a 4401 asks for a fresh token, until the next welcome", async () => {
  last().open();
  await flush();
  last().drop(4503); // queda comum: o token da memória ainda vale
  await vi.advanceTimersByTimeAsync(1000);
  last().open();
  await flush();
  last().drop(4401);
  last().open();
  await flush();
  last().receive({ v: 1, type: "welcome" });
  last().drop(1006);
  await vi.advanceTimersByTimeAsync(1000);
  last().open();
  await flush();
  expect(asked).toEqual([false, false, true, false]);
});

test("a null token is a lost session and stops", async () => {
  tokens = [null];
  last().open();
  await flush();
  expect(closed).toEqual(["unauthenticated"]);
  expect(last().sent).toEqual([]);
  expect(last().closedWith).toBe(1000);
});

test("a token that fails is retried with the backoff, not a lost session", async () => {
  tokens = [new Error("503"), "token-2"];
  last().open();
  await flush();
  expect(closed).toEqual([]);
  expect(last().closedWith).toBe(1000); // sem join, o socket aberto não fica pendurado
  expect(reconnecting).toBe(1);
  await vi.advanceTimersByTimeAsync(999);
  expect(sockets).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(1);
  last().open();
  await flush();
  expect(JSON.parse(last().sent[0]).token).toBe("token-2");
});

test("a failing refresh after 4401 keeps asking for a fresh token", async () => {
  tokens = ["token-1", new Error("429"), "token-3"];
  last().open();
  await flush();
  last().drop(4401);
  last().open();
  await flush();
  await vi.advanceTimersByTimeAsync(1000);
  last().open();
  await flush();
  expect(asked).toEqual([false, true, true]);
  expect(JSON.parse(last().sent[0]).token).toBe("token-3");
  expect(closed).toEqual([]);
});

test("closing while the token is on its way sends nothing", async () => {
  let release: (token: string) => void = () => {};
  socket.close();
  socket = createGameSocket({
    url: "wss://test/ws/game/12", matchId: 12,
    getAccessToken: () => new Promise((resolve) => { release = resolve; }),
    onMessage: () => {}, onReconnecting: () => {}, onClosed: (error) => closed.push(error),
    createWebSocket: () => { const ws = new FakeWebSocket(); sockets.push(ws); return ws; },
    visibility,
  });
  last().open();
  socket.close();
  release("token-1");
  await flush();
  expect(last().sent).toEqual([]);
  expect(closed).toEqual([]);
});

test("a welcome gives 4401 its one retry back", () => {
  last().drop(4401);
  last().receive({ v: 1, type: "welcome" });
  last().drop(4401);
  expect(sockets).toHaveLength(3);
  expect(closed).toEqual([]);
});

test("a dropped socket comes back after 1, 2 and 4 s", async () => {
  for (const waitMs of [1000, 2000, 4000]) {
    last().drop(1006);
    const before = sockets.length;
    await vi.advanceTimersByTimeAsync(waitMs - 1);
    expect(sockets).toHaveLength(before);
    await vi.advanceTimersByTimeAsync(1);
    expect(sockets).toHaveLength(before + 1);
  }
  expect(reconnecting).toBe(3);
});

test("the wait stops growing at 30 s and varies at most 20 %", () => {
  expect([0, 1, 2, 3, 4, 5, 9].map((attempt) => backoffMs(attempt, () => 0.5)))
    .toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000]);
  expect(backoffMs(0, () => 0)).toBeCloseTo(800);
  expect(backoffMs(0, () => 1)).toBeCloseTo(1200);
});

test("a welcome resets the wait to 1 s", async () => {
  last().drop(1006);
  await vi.advanceTimersByTimeAsync(1000);
  last().drop(1006);
  await vi.advanceTimersByTimeAsync(2000);
  last().receive({ v: 1, type: "welcome" });
  last().drop(4503);
  await vi.advanceTimersByTimeAsync(1000);
  expect(sockets).toHaveLength(4);
});

test("a hidden tab waits to be visible before reconnecting", async () => {
  visibility.hidden = true;
  last().drop(1006);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(sockets).toHaveLength(1);
  visibility.hidden = false;
  visibility.dispatchEvent(new Event("visibilitychange"));
  expect(sockets).toHaveLength(2);
});

test("close cancels a pending reconnection and reports nothing", async () => {
  last().drop(1006);
  socket.close();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(sockets).toHaveLength(1);
  expect(closed).toEqual([]);
});

test("close before the token arrives sends no join", async () => {
  last().open();
  socket.close();
  await flush();
  expect(last().sent).toEqual([]);
});

test("send only writes while the socket is open", () => {
  socket.send({ v: 1, type: "ping", t: 1 });
  last().open();
  socket.send({ v: 1, type: "ping", t: 2 });
  expect(last().sent.map((data) => JSON.parse(data).t)).toEqual([2]);
});
