// Socket do /ws/app (ws-manager.md §2.4, §2.8 e §2.9): aberto do login ao logout, e só de ida.
// Não sabe de lobby nem de amigos: entrega cada mensagem a quem assinou.
import type { RoomInfo } from "../api/types";

// Servidor → cliente (ws-manager.md §2.4); o formato do fio está em app/ws/messages.py
export type AppServerMessage =
  | { v: 1; type: "welcome"; user_id: number; online_friends: number[] }
  | { v: 1; type: "presence"; user_id: number; online: boolean }
  | { v: 1; type: "lobby_update"; room: RoomInfo }
  | { v: 1; type: "lobby_removed"; match_id: number; reason: "started" | "aborted" }
  | { v: 1; type: "match_started"; match_id: number }
  | { v: 1; type: "pong"; t: number }
  | { v: 1; type: "error"; code: string; message: string };

export type AppSocketError = "invalid_message" | "unauthenticated";

const NORMAL_CLOSE = 1000;
const INVALID_MESSAGE = 4400;
const UNAUTHENTICATED = 4401;
const CONNECTING = 0;
const OPEN = 1;
const BACKOFF_S = [1, 2, 4, 8, 16];
const BACKOFF_MAX_S = 30;
const JITTER = 0.2;

export type WebSocketLike = Pick<WebSocket, "send" | "close"
  | "onopen" | "onmessage" | "onclose" | "onerror"> & { readonly readyState: number };
export type WebSocketFactory = (url: string) => WebSocketLike;
export type Visibility = Pick<Document, "hidden" | "addEventListener" | "removeEventListener">;

export interface AppSocketOptions {
  url: string;

  getAccessToken: (fresh: boolean) => Promise<string | null>;
  onMessage: (message: AppServerMessage) => void;
  onReconnecting: () => void;
  onClosed: (error: AppSocketError | null) => void;
  createWebSocket?: WebSocketFactory;
  visibility?: Visibility;
  random?: () => number;
}

export interface AppSocket {
  close(): void;
}

export function appSocketUrl(): string {
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${location.host}/ws/app`;
}

export function backoffMs(attempt: number, random: () => number): number {
  const base = BACKOFF_S[attempt] ?? BACKOFF_MAX_S;
  return base * 1000 * (1 - JITTER + 2 * JITTER * random());
}

function isAppMessage(value: unknown): value is AppServerMessage {
  if (typeof value !== "object" || value === null)
    return false;
  const { v, type } = value as { v?: unknown; type?: unknown };
  return v === 1 && typeof type === "string";
}

function closeWhenOpen(this: WebSocket): void {
  this.close(NORMAL_CLOSE);
}

export function createAppSocket(options: AppSocketOptions): AppSocket {
  const createWebSocket = options.createWebSocket ?? ((url: string) => new WebSocket(url));
  const visibility = options.visibility ?? document;
  const random = options.random ?? Math.random;

  let ws: WebSocketLike | null = null;
  let attempt = 0;
  let fresh = false;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function stop(error: AppSocketError | null): void {
    if (stopped)
      return;
    stopped = true;
    cleanup();
    options.onClosed(error);
  }

  function cleanup(): void {
    if (timer !== null)
      clearTimeout(timer);
    timer = null;
    visibility.removeEventListener("visibilitychange", onVisible);
    if (ws !== null) {
      ws.onmessage = ws.onclose = ws.onerror = null;
      if (ws.readyState === CONNECTING) {
        ws.onopen = closeWhenOpen;
      } else {
        ws.onopen = null;
        if (ws.readyState === OPEN)
          ws.close(NORMAL_CLOSE);
      }
      ws = null;
    }
  }

  function connect(): void {
    if (stopped)
      return;
    const socket = createWebSocket(options.url);
    ws = socket;
    socket.onopen = () => void join(socket);
    socket.onmessage = (event) => receive(event.data);
    socket.onclose = (event) => closed(socket, event.code);
    socket.onerror = () => {}; // o close vem logo depois e decide
  }

  async function join(socket: WebSocketLike): Promise<void> {
    let token: string | null;
    try {
      token = await options.getAccessToken(fresh);
    } catch {
      if (socket === ws) {
        cleanup();
        scheduleRetry();
      }
      return;
    }
    if (token === null)
      return stop("unauthenticated");
    if (socket !== ws || socket.readyState !== OPEN)
      return;
    socket.send(JSON.stringify({ v: 1, type: "join", token }));
  }

  function receive(data: unknown): void {
    let message: unknown;
    try {
      message = JSON.parse(String(data));
    } catch {
      message = null;
    }
    if (!isAppMessage(message))
      return stop("invalid_message");
    if (message.type === "welcome") {
      attempt = 0;
      fresh = false;
    }
    if (message.type !== "error")
      options.onMessage(message);
  }

  function closed(socket: WebSocketLike, code: number): void {
    if (socket !== ws || stopped)
      return;
    ws = null;
    if (code === NORMAL_CLOSE)
      return stop(null);
    if (code === INVALID_MESSAGE)
      return stop("invalid_message"); // é bug: tentar de novo daria o mesmo
    if (code === UNAUTHENTICATED) {
      if (fresh)
        return stop("unauthenticated"); // o token novo também foi recusado
      fresh = true;
      options.onReconnecting();
      return connect();
    }
    // 4429, 4503, 1006 e o resto: a rede ou o servidor caíram
    scheduleRetry();
  }

  function scheduleRetry(): void {
    timer = setTimeout(retry, backoffMs(attempt, random));
    attempt += 1;
    options.onReconnecting();
  }

  function retry(): void {
    timer = null;

    if (visibility.hidden)
      visibility.addEventListener("visibilitychange", onVisible);
    else
      connect();
  }

  function onVisible(): void {
    if (visibility.hidden)
      return;
    visibility.removeEventListener("visibilitychange", onVisible);
    connect();
  }

  connect();

  return {
    close() {
      stopped = true;
      cleanup();
    },
  };
}
