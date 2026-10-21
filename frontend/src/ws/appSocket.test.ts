import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  backoffMs, createAppSocket, type AppServerMessage, type AppSocket, type AppSocketError,
  type Visibility, type WebSocketLike,
} from "./appSocket";

// Socket falso: o teste decide quando abre, o que chega e com que código cai
class FakeWebSocket implements WebSocketLike {
  readyState = 0;
  sent: string[] = [];
  closedWith: number | null = null;
  onopen: WebSocketLike["onopen"] = null;
  onmessage: WebSocketLike["onmessage"] = null;
  onclose: WebSocketLike["onclose"] = null;
  onerror: WebSocketLike["onerror"] = null;
  send(data: string) {
    this.sent.push(data);
  }
  close(code?: number) {
    this.closedWith = code ?? 1000;
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.onopen?.call(this as never, new Event("open"));
  }
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

const WELCOME = { v: 1, type: "welcome", user_id: 7, online_friends: [] };

let sockets: FakeWebSocket[];
let received: AppServerMessage[];
let closed: Array<AppSocketError | null>;
let reconnecting: number;
let visibility: FakeVisibility;
let tokenRequests: boolean[];
let refreshed: string | null;
let offline: boolean;
let socket: AppSocket;

const last = () => sockets[sockets.length - 1];
const flush = () => vi.advanceTimersByTimeAsync(0); // deixa o getAccessToken resolver

beforeEach(() => {
  vi.useFakeTimers();
  sockets = [];
  received = [];
  closed = [];
  reconnecting = 0;
  visibility = new FakeVisibility();
  tokenRequests = [];
  refreshed = "token-refreshed";
  offline = false;
  socket = createAppSocket({
    url: "wss://test/ws/app",
    getAccessToken: async (fresh) => {
      tokenRequests.push(fresh);
      if (offline)
        throw new Error("offline");
      return fresh ? refreshed : "token-memory";
    },
    onMessage: (message) => received.push(message),
    onReconnecting: () => {
      reconnecting += 1;
    },
    onClosed: (error) => closed.push(error),
    createWebSocket: () => {
      const ws = new FakeWebSocket();
      sockets.push(ws);
      return ws;
    },
    visibility,
    random: () => 0.5, // sem variação: as esperas ficam exatas
  });
});

afterEach(() => {
  socket.close();
  vi.useRealTimers();
});

test("the first message is join with the token from memory", async () => {
  last().open();
  await flush();
  expect(JSON.parse(last().sent[0])).toEqual({ v: 1, type: "join", token: "token-memory" });
  expect(tokenRequests).toEqual([false]);
});

test("server messages reach onMessage, error does not", () => {
  last().open();
  last().receive(WELCOME);
  last().receive({ v: 1, type: "error", code: "server_shutdown", message: "x" });
  last().receive({ v: 1, type: "lobby_removed", match_id: 12, reason: "aborted" });
  expect(received.map((message) => message.type)).toEqual(["welcome", "lobby_removed"]);
});

test.each([
  ["that is not JSON", "{nope"],
  ["without v", JSON.stringify({ type: "pong", t: 1 })],
  ["with another version", JSON.stringify({ v: 2, type: "pong", t: 1 })],
  ["without type", JSON.stringify({ v: 1 })],
])("a message %s stops as invalid_message", (_, data) => {
  last().open();
  last().receive(data);
  expect(closed).toEqual(["invalid_message"]);
  expect(last().closedWith).toBe(1000);
  expect(received).toEqual([]);
});

test("1000 is the normal end and does not reconnect", async () => {
  last().drop(1000);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(closed).toEqual([null]);
  expect(sockets).toHaveLength(1);
});

test("4400 is a bug: stops without reconnecting", async () => {
  last().drop(4400);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(closed).toEqual(["invalid_message"]);
  expect(sockets).toHaveLength(1);
});

test("4401 reconnects right away with a refreshed token, only once", async () => {
  last().open();
  await flush();
  last().drop(4401);
  expect(sockets).toHaveLength(2);
  last().open();
  await flush();
  expect(JSON.parse(last().sent[0]).token).toBe("token-refreshed");
  expect(tokenRequests).toEqual([false, true]);
  last().drop(4401);
  expect(closed).toEqual(["unauthenticated"]);
});

test("4401 with no session left stops as unauthenticated", async () => {
  refreshed = null;
  last().drop(4401);
  last().open();
  await flush();
  expect(closed).toEqual(["unauthenticated"]);
  expect(last().sent).toEqual([]);
});

test("a welcome gives 4401 its one retry back", () => {
  last().drop(4401);
  last().receive(WELCOME);
  last().drop(4401);
  expect(sockets).toHaveLength(3);
  expect(closed).toEqual([]);
});

test.each([1006, 4429, 4503])("%i comes back after 1, 2 and 4 s", async (code) => {
  for (const waitMs of [1000, 2000, 4000]) {
    last().drop(code);
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
  last().receive(WELCOME);
  last().drop(4503);
  await vi.advanceTimersByTimeAsync(1000);
  expect(sockets).toHaveLength(4);
});

test("a network failure while getting the token retries later instead of stopping", async () => {
  offline = true;
  last().open();
  await flush();
  expect(closed).toEqual([]);
  expect(last().closedWith).toBe(1000);
  offline = false;
  await vi.advanceTimersByTimeAsync(1000);
  expect(sockets).toHaveLength(2);
  expect(reconnecting).toBe(1);
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

test("closing while connecting waits for open, then closes without join", async () => {
  socket.close();
  expect(last().closedWith).toBeNull();
  last().open();
  await flush();
  expect(last().closedWith).toBe(1000);
  expect(last().sent).toEqual([]);
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
