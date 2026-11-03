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

// POST /api/matches; sem max_players, o servidor usa o teto do Map
export interface CreateMatchInput {
  mode: Mode;
  map: string;
  max_players?: number;
}
