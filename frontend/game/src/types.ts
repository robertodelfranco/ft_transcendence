// Mensagens de /ws/game, espelho de backend/app/game/protocol.py (ws-messages.md §2).
// Os nomes dos campos são os do fio (snake_case); quem converte para o ViewState é o net/.

export const PROTOCOL_VERSION = 1;

// ---------- Cliente → servidor (§2.2) ----------

export interface Keys {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  rot_left: boolean;
  rot_right: boolean;
  sprint: boolean;
}

export type ActionKind = "fire" | "door";

export interface JoinMessage {
  v: 1;
  type: "join";
  match_id: number;
  token: string;
}

export interface InputMessage {
  v: 1;
  type: "input";
  seq: number; // começa em 1 a cada conexão e só cresce; o mesmo contador da Action
  keys: Keys;
  mouse_dx: number; // rad, giro acumulado desde o último input; positivo = rot_right
}

export interface ActionMessage {
  v: 1;
  type: "action";
  seq: number;
  kind: ActionKind;
}

export interface PingMessage {
  v: 1;
  type: "ping";
  t: number; // relógio do cliente, ms
}

export type ClientMessage = JoinMessage | InputMessage | ActionMessage | PingMessage;

// ---------- Snapshot (§2.4 e §2.5) ----------

export type Mode = "coop" | "pvp";
export type EnemyState = "alert" | "attack" | "dying";
export type BossState = "idle" | "alert" | "attack" | "dying";
export type ProjectileState = "moving" | "hit";
export type ProjectileKind = "fireball" | "bullet";

export interface PlayerSnapshot {
  id: number; // user_id
  name: string;
  x: number;
  y: number;
  dx: number;
  dy: number;
  hp: number;
  mana: number;
  armor: number;
  keys: number;
  alive: boolean;
  connected: boolean;
}

export interface EnemySnapshot {
  id: string;
  x: number;
  y: number;
  state: EnemyState;
}

export interface BossSnapshot {
  x: number;
  y: number;
  hp: number;
  state: BossState;
}

export interface ProjectileSnapshot {
  id: string;
  kind: ProjectileKind;
  owner: number | null; // user_id; null no bullet do Boss
  x: number;
  y: number;
  dx: number;
  dy: number;
  state: ProjectileState;
}

export interface DoorSnapshot {
  x: number;
  y: number;
  open: boolean;
  locked: boolean;
}

export interface GridCell {
  x: number;
  y: number;
  c: string; // "0" para Pickup coletado, "O" para Door aberta
}

export interface Scoreboard {
  players: Array<{ id: number; frags: number }>; // ordem decrescente de frags
  time_left_s: number;
}

export interface Snapshot {
  tick: number;
  last_input_seq: number; // o único campo que muda por destinatário
  players: PlayerSnapshot[];
  enemies: EnemySnapshot[];
  boss: BossSnapshot | null;
  projectiles: ProjectileSnapshot[];
  doors: DoorSnapshot[];
  grid_delta: GridCell[]; // acumulado desde o welcome.map.grid
  scoreboard: Scoreboard | null; // null no coop
}

// ---------- Events (§2.6) ----------

type EventOf<Name extends string, Data> = { name: Name; data: Data };

export type MatchReason =
  | "boss_defeated" | "all_dead" | "frag_limit" | "time_limit" | "forfeit" | "server_shutdown";

// by, killer_id e winner_ids são user_id; by é null quando o autor é um Enemy ou o Boss
export type GameEvent =
  | EventOf<"player_joined", { player_id: number; name: string }>
  | EventOf<"player_disconnected", { player_id: number }>
  | EventOf<"player_reconnected", { player_id: number }>
  | EventOf<"player_left", { player_id: number }>
  | EventOf<"door_opened", { x: number; y: number; by: number }>
  | EventOf<"item_picked", { kind: "key" | "potion" | "mana" | "armor"; by: number; x: number; y: number }>
  | EventOf<"player_hit", {
      target: number; by: number | null; source: "enemy" | "bullet" | "fireball";
      amount: number; absorbed: number;
    }>
  | EventOf<"enemy_died", { enemy_id: string; killer_id: number }>
  | EventOf<"boss_died", { killer_id: number }>
  | EventOf<"player_died", { player_id: number; by: number | null }>
  | EventOf<"player_respawned", { player_id: number; x: number; y: number }>
  | EventOf<"game_over", { result: "win" | "loss" | "draw"; winner_ids: number[]; reason: MatchReason }>
  | EventOf<"achievement_unlocked", { user_id: number; code: string }>;

// ---------- Servidor → cliente (§2.3) ----------

export interface RoomOptions {
  theme: "dungeon" | "sewer";
  start_hp: number;
  pickups: { potion: boolean; mana: boolean; armor: boolean };
  frag_limit?: number; // só no pvp
  time_limit_s?: number; // só no pvp
}

export interface WelcomeMessage {
  v: 1;
  type: "welcome";
  user_id: number;
  room: { match_id: number; mode: Mode; map: string; options: RoomOptions };
  map: { grid: string[] }; // o Grid inicial da Room
  snapshot: Snapshot;
}

export type SnapshotMessage = { v: 1; type: "snapshot" } & Snapshot;

export type EventMessage = { v: 1; type: "event"; tick: number } & GameEvent;

export interface PongMessage {
  v: 1;
  type: "pong";
  t: number;
}

// ---------- Fechamento (§2.7) ----------

export const CLOSE_CODES = {
  invalid_message: 4400,
  unauthenticated: 4401,
  not_a_member: 4403,
  room_not_found: 4404,
  replaced: 4408,
  room_full: 4409,
  slow_consumer: 4429,
  server_shutdown: 4503,
} as const;

export type ErrorCode = keyof typeof CLOSE_CODES;

export interface ErrorMessage {
  v: 1;
  type: "error";
  code: ErrorCode; // é o que a casca traduz
  message: string; // só para log, nunca na tela
}

export type ServerMessage =
  | WelcomeMessage | SnapshotMessage | EventMessage | PongMessage | ErrorMessage;
