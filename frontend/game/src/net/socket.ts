// Socket do /ws/game: join, mensagens e o que fazer quando ele cai (ws-messages.md §2.7,
// ws-manager.md §2.9). Não sabe nada de Snapshot: entrega as mensagens a quem montou.
import { CLOSE_CODES, PROTOCOL_VERSION, type ClientMessage, type ErrorCode,
  type ServerMessage } from "../types";

const NORMAL_CLOSE = 1000;
const CONNECTING = 0; // WebSocket.CONNECTING e OPEN, sem depender do global nos testes
const OPEN = 1;

// a Room não aceita este User, ou é bug: tentar de novo daria o mesmo resultado
const FINAL_CODES = new Set<number>([CLOSE_CODES.invalid_message, CLOSE_CODES.not_a_member,
  CLOSE_CODES.room_not_found, CLOSE_CODES.replaced, CLOSE_CODES.room_full]);

// 1, 2, 4, 8, 16 s e depois a cada 30 s, com até 20 % de variação para as abas não voltarem juntas
const BACKOFF_S = [1, 2, 4, 8, 16];
const BACKOFF_MAX_S = 30;
const JITTER = 0.2;

export type WebSocketLike = Pick<WebSocket, "send" | "close"
  | "onopen" | "onmessage" | "onclose" | "onerror"> & { readonly readyState: number };
export type WebSocketFactory = (url: string) => WebSocketLike;
export type Visibility = Pick<Document, "hidden" | "addEventListener" | "removeEventListener">;

export interface GameSocketOptions {
  url: string;
  matchId: number;
  getAccessToken: () => Promise<string>;
  onMessage: (message: ServerMessage) => void;
  onReconnecting: () => void;
  // não reconecta mais: null é o fim normal (1000), senão o code que a casca traduz
  onClosed: (error: ErrorCode | null) => void;
  createWebSocket?: WebSocketFactory;
  visibility?: Visibility;
  random?: () => number;
}

export interface GameSocket {
  send(message: ClientMessage): void;
  close(): void;
}

export function backoffMs(attempt: number, random: () => number): number {
  const base = BACKOFF_S[attempt] ?? BACKOFF_MAX_S;
  return base * 1000 * (1 - JITTER + 2 * JITTER * random());
}

function codeName(code: number): ErrorCode | undefined {
  return (Object.keys(CLOSE_CODES) as ErrorCode[]).find((name) => CLOSE_CODES[name] === code);
}

// Só a casca da mensagem: os campos de cada tipo são responsabilidade de quem a consome
function isServerMessage(value: unknown): value is ServerMessage {
  if (typeof value !== "object" || value === null) return false;
  const { v, type } = value as { v?: unknown; type?: unknown };
  return v === PROTOCOL_VERSION && typeof type === "string";
}

function closeWhenOpen(this: WebSocket): void {
  this.close(NORMAL_CLOSE);
}

export function createGameSocket(options: GameSocketOptions): GameSocket {
  const createWebSocket = options.createWebSocket ?? ((url: string) => new WebSocket(url));
  const visibility = options.visibility ?? document;
  const random = options.random ?? Math.random;

  let ws: WebSocketLike | null = null;
  let attempt = 0;
  let refreshed = false; // o 4401 pede token novo uma vez só por conexão aceita
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function stop(error: ErrorCode | null): void {
    if (stopped) return;
    stopped = true;
    cleanup();
    options.onClosed(error);
  }

  function cleanup(): void {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    visibility.removeEventListener("visibilitychange", onVisible);
    if (ws !== null) {
      ws.onmessage = ws.onclose = ws.onerror = null;
      // fechar ainda conectando faz o Chrome avisar no console (o StrictMode faz isso em todo dev):
      // espera abrir e fecha em seguida, sem mandar join
      if (ws.readyState === CONNECTING) {
        ws.onopen = closeWhenOpen;
      } else {
        ws.onopen = null;
        if (ws.readyState === OPEN) ws.close(NORMAL_CLOSE);
      }
      ws = null;
    }
  }

  function connect(): void {
    if (stopped) return;
    const socket = createWebSocket(options.url);
    ws = socket;
    socket.onopen = () => void join(socket);
    socket.onmessage = (event) => receive(event.data);
    socket.onclose = (event) => closed(socket, event.code);
    socket.onerror = () => {}; // o close vem logo depois e decide
  }

  async function join(socket: WebSocketLike): Promise<void> {
    let token: string;
    try {
      token = await options.getAccessToken();
    } catch {
      stop("unauthenticated");
      return;
    }
    if (socket !== ws || socket.readyState !== OPEN) return; // fechou enquanto o token chegava
    socket.send(JSON.stringify({ v: 1, type: "join", match_id: options.matchId, token }));
  }

  function receive(data: unknown): void {
    let message: unknown;
    try {
      message = JSON.parse(String(data));
    } catch {
      message = null;
    }
    if (!isServerMessage(message)) {
      stop("invalid_message");
      return;
    }
    if (message.type === "welcome") {
      attempt = 0;
      refreshed = false;
    }
    // o error só antecipa o close que vem em seguida; quem decide é o código do close
    if (message.type !== "error") options.onMessage(message);
  }

  function closed(socket: WebSocketLike, code: number): void {
    if (socket !== ws || stopped) return;
    ws = null;
    if (code === NORMAL_CLOSE) return stop(null);
    if (FINAL_CODES.has(code)) return stop(codeName(code) ?? "invalid_message");
    if (code === CLOSE_CODES.unauthenticated) {
      if (refreshed) return stop("unauthenticated");
      refreshed = true; // o getAccessToken da casca renova o token se ele venceu
      options.onReconnecting();
      return connect();
    }
    // 4429, 4503, 1006 e o resto: a rede ou o servidor caíram; o Grace period segura o Player.
    // O timer vem antes do aviso: quem é avisado pode chamar close() e cancelá-lo
    timer = setTimeout(retry, backoffMs(attempt, random));
    attempt += 1;
    options.onReconnecting();
  }

  function retry(): void {
    timer = null;
    // aba escondida não fica tentando: volta quando ela aparecer (ws-manager.md §5, item 2)
    if (visibility.hidden) visibility.addEventListener("visibilitychange", onVisible);
    else connect();
  }

  function onVisible(): void {
    if (visibility.hidden) return;
    visibility.removeEventListener("visibilitychange", onVisible);
    connect();
  }

  connect();

  return {
    send(message) {
      // fora do ar a mensagem se perde: o servidor zera fila e seq no próximo join
      if (ws !== null && ws.readyState === OPEN) ws.send(JSON.stringify(message));
    },
    close() {
      stopped = true;
      cleanup();
    },
  };
}
