import type { Language } from "../i18n/languages";

export interface PublicUser {
  id: number;
  username: string;
  avatar_url: string;
  created_at: string;
}

export interface PrivateUser extends PublicUser {
  email: string;
  preferred_language: Language;
  has_password: boolean;
  providers: string[];
}

// GET /api/users/{id} (i18n.md §2.7): o perfil é PublicUser até para o próprio User
export interface ProfileUser extends PublicUser {
  is_friend: boolean; // quem pede tem este User como amigo
  is_me: boolean;
}

// GET /api/users/me/friends: o online vale no momento do GET; depois, quem atualiza é o presence
export interface Friend extends PublicUser {
  online: boolean;
  since: string;
}

// PATCH /api/users/me (i18n.md §2.7): só o que muda, ao menos um campo
export interface ProfileChanges {
  username?: string;
  preferred_language?: Language;
}

export interface AuthResponse {
  authenticated: true;
  access_token: string;
  token_type: "bearer";
  expires_in: number;
  user: PrivateUser;
}

// /refresh sem cookie responde 200 {"authenticated": false}, não 401 (auth.md §2.2)
export type RefreshResponse = AuthResponse | { authenticated: false };

// Lobby (matches-api.md §2.2, rooms.md §2.3, room-options.md §2)

export type Mode = "coop" | "pvp";
export type Theme = "dungeon" | "sewer";
export type RoomStatus = "lobby" | "running" | "finished" | "aborted";

export interface Pickups {
  potion: boolean;
  mana: boolean;
  armor: boolean;
}

// Chegam com os defaults já aplicados pelo servidor; o coop vem sem as chaves do pvp
export interface RoomOptions {
  theme: Theme;
  start_hp: number;
  pickups: Pickups;
  frag_limit?: number; // só pvp
  time_limit_s?: number; // só pvp
}

export interface RoomPlayer {
  user_id: number;
  username: string;
  avatar_url: string;
  ready: boolean; // vive na Room, nunca no banco
  connected: boolean; // false durante o Grace period
  joined_at: string; // a ordem de entrada é a ordem de sucessão do host
}

export interface RoomInfo {
  match_id: number;
  mode: Mode;
  map: string;
  max_players: number;
  min_players: number;
  status: RoomStatus;
  created_by: number; // host atual
  options: RoomOptions;
  created_at: string;
  players: RoomPlayer[];
}

export interface RoomList {
  items: RoomInfo[];
}

// GET /api/maps: ordem alfabética, o primeiro de cada Mode é o default
export interface MapInfo {
  name: string;
  max_players: number;
}

export type MapCatalog = Record<Mode, MapInfo[]>;

// POST /api/matches; sem max_players, o servidor usa o teto do Map, e sem options, os defaults
export interface CreateMatchInput {
  mode: Mode;
  map: string;
  max_players?: number;
  options?: RoomOptions; // só as do Mode: o coop vai sem frag_limit e time_limit_s
}

// Resultado da partida (matches-api.md §2.4), lido do banco

export interface MatchPlayerRow {
  user_id: number;
  username: string;
  avatar_url: string;
  won: boolean; // quem ganhou é isto, não o result da Room
  survived: boolean;
  disconnected_at_end: boolean;
  kills: number;
  frags: number;
  deaths: number;
  damage_dealt: number;
  damage_taken: number;
  armor_absorbed: number;
  keys_collected: number;
  potions_used: number;
  xp_gained: number;
  elo_before: number | null; // null no coop
  elo_after: number | null;
}

// GET /api/matches/{id}/result: só existe com o Match finished; lobby, running e aborted são 409
export interface MatchDetail {
  match_id: number;
  created_by: number;
  mode: Mode;
  map: string;
  status: "finished";
  options: RoomOptions;
  started_at: string;
  ended_at: string;
  duration_s: number; // já em segundos: a tela não conhece o TICK_RATE
  result: "win" | "loss" | "draw"; // da Room: no pvp, quem perdeu também recebe "win"
  reason: string; // code traduzível (game:reasons)
  players: MatchPlayerRow[]; // em ordem de user_id
}

// Histórico, estatísticas e leaderboard (matches-api.md §2.3)

export interface Page<T> {
  items: T[];
  page: number;
  per_page: number;
  total: number;
}

// Uma linha do histórico, do ponto de vista do User da rota
export interface MatchHistoryItem {
  match_id: number;
  mode: Mode;
  map: string;
  ended_at: string;
  duration_s: number;
  result: "win" | "loss" | "draw"; // de players[].won deste User, não o da Room
  reason: string;
  me: Pick<MatchPlayerRow, "kills" | "frags" | "deaths" | "damage_dealt" | "damage_taken"
    | "xp_gained" | "elo_before" | "elo_after">;
  others: Array<Pick<MatchPlayerRow, "user_id" | "username" | "avatar_url" | "won">>; // companheiros ou oponente
}

// GET /api/users/{id}/stats: o agregado por User e por Mode, calculado no servidor (matches-api.md §2.3)
export interface PlayerStats {
  matches_played: number;
  wins: number;
  losses: number;
  draws: number;
  kills: number; // o coop conta Kills; o pvp conta Frags
  frags: number;
  deaths: number;
  playtime_s: number;
  xp: number;
  level: number;
  elo: number; // só muda no pvp; o coop fica em 1000
  win_rate: number; // 0 a 1, já dividido: a tela não calcula
  xp_to_next_level: number; // XP que falta, não a parcela já preenchida
}

export type UserStats = Record<Mode, PlayerStats>;
