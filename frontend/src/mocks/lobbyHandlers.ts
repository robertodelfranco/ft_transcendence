import { http, HttpResponse } from "msw";
import type { CreateMatchInput, MapCatalog, Mode, RoomInfo, RoomOptions, RoomPlayer } from "../api/types";
import { publish } from "./appSocketHandlers";
import authResponse from "./fixtures/authResponse.json";
import maps from "./fixtures/maps.json";
import roomsFixture from "./fixtures/rooms.json";
import { DEFAULT_CHARACTER, isCharacterId } from "../../game/src/playerCharacters";

const me = authResponse.user;
const catalog: MapCatalog = maps;

let rooms: RoomInfo[] = [];
let nextMatchId = 100;

export function resetMockLobby(): void {
  rooms = structuredClone(roomsFixture.items) as RoomInfo[];
  nextMatchId = 100;
}
resetMockLobby();

// Defaults do room-options.md §2; no servidor, a fonte é a dataclass RoomOptions
function defaultOptions(mode: Mode): RoomOptions {
  const coop: RoomOptions = {
    theme: "dungeon", start_hp: 10, pickups: { potion: true, mana: true, armor: true },
  };
  return mode === "pvp" ? { ...coop, frag_limit: 5, time_limit_s: 180 } : coop;
}

// Cada mudança publica no /ws/app do mock como o lobby do backend (#128), depois de mudar o estado

// Envelope de erro do auth.md §2.5; `message` é texto de log, aqui só repete o code
function apiError(status: number, code: string) {
  return HttpResponse.json(
    { error: { code, message: code, request_id: "mock0001", fields: null } },
    { status },
  );
}

function findRoom(matchId: unknown): RoomInfo | undefined {
  return rooms.find((room) => room.match_id === Number(matchId));
}

function isIn(room: RoomInfo): boolean {
  return room.players.some((player) => player.user_id === me.id);
}

function asPlayer(): RoomPlayer {
  return {
    user_id: me.id, username: me.username, avatar_url: me.avatar_url,
    ready: false, connected: true, joined_at: new Date().toISOString(), character_id: DEFAULT_CHARACTER,
  };
}

export const lobbyHandlers = [
  http.get("/api/maps", () => HttpResponse.json(catalog)),

  http.get("/api/matches", ({ request }) => {
    const mode = new URL(request.url).searchParams.get("mode");
    const items = rooms.filter((room) => room.status === "lobby" && (!mode || room.mode === mode));
    return HttpResponse.json({ items });
  }),

  // A Room do User, em lobby ou em partida (matches-api.md §2.2). Antes do /:matchId: no MSW
  // ganha o primeiro que casa, e o :matchId casaria "current"
  http.get("/api/matches/current", () => {
    const room = rooms.find(isIn);
    return room ? HttpResponse.json(room) : new HttpResponse(null, { status: 204 });
  }),

  http.get("/api/matches/:matchId", ({ params }) => {
    const room = findRoom(params.matchId);
    return room ? HttpResponse.json(room) : apiError(404, "match_not_found");
  }),

  // Quem cria já entra como primeiro Player e é o host
  http.post("/api/matches", async ({ request }) => {
    const body = (await request.json()) as CreateMatchInput;
    const map = catalog[body.mode]?.find((info) => info.name === body.map);
    if (!map)
      return apiError(404, "map_not_found");
    if (rooms.some(isIn))
      return apiError(409, "already_in_other_match");
    const maxPlayers = body.max_players ?? map.max_players;
    const room: RoomInfo = {
      match_id: nextMatchId++, mode: body.mode, map: body.map,
      max_players: maxPlayers,
      // como o start_minimum do servidor (rooms.md §4, decisão 12): só o Solo começa com um
      min_players: maxPlayers === 1 ? 1 : 2,
      status: "lobby", created_by: me.id,
      // como o servidor: os defaults do Mode, com o que o formulário mandou por cima
      options: { ...defaultOptions(body.mode), ...body.options },
      created_at: new Date().toISOString(), players: [asPlayer()],
    };
    rooms.push(room);
    publish({ type: "lobby_update", room });
    return HttpResponse.json(room, { status: 201 });
  }),

  http.post("/api/matches/:matchId/join", ({ params }) => {
    const room = findRoom(params.matchId);
    if (!room)
      return apiError(404, "match_not_found");
    if (room.status !== "lobby")
      return apiError(409, "already_started");
    if (isIn(room))
      return apiError(409, "already_in");
    if (rooms.some(isIn))
      return apiError(409, "already_in_other_match");
    if (room.players.length >= room.max_players)
      return apiError(409, "room_full");
    room.players.push(asPlayer());
    publish({ type: "lobby_update", room });
    return HttpResponse.json(room);
  }),

  // O último a sair destrói a Room; o host que sai passa o posto ao próximo na ordem de entrada
  http.post("/api/matches/:matchId/leave", ({ params }) => {
    const room = findRoom(params.matchId);
    if (!room)
      return apiError(404, "match_not_found");
    if (!isIn(room))
      return apiError(409, "not_in_match");
    // em partida é o "Sair da partida" (#240): o Player sai e a Room segue, sem lobby_update
    if (room.status !== "lobby") {
      room.players = room.players.filter((player) => player.user_id !== me.id);
      return new HttpResponse(null, { status: 204 });
    }
    room.players = room.players.filter((player) => player.user_id !== me.id);
    if (room.players.length === 0) {
      rooms = rooms.filter((other) => other !== room);
      publish({ type: "lobby_removed", match_id: room.match_id, reason: "aborted" });
    } else {
      if (room.created_by === me.id)
        room.created_by = room.players[0].user_id;
      publish({ type: "lobby_update", room });
    }
    return new HttpResponse(null, { status: 204 });
  }),

  http.post("/api/matches/:matchId/ready", async ({ params, request }) => {
    const room = findRoom(params.matchId);
    if (!room)
      return apiError(404, "match_not_found");
    if (room.status !== "lobby")
      return apiError(409, "already_started");
    const player = room.players.find((seat) => seat.user_id === me.id);
    if (!player)
      return apiError(409, "not_in_match");
    const body = (await request.json()) as { ready: boolean };
    player.ready = body.ready;
    publish({ type: "lobby_update", room });
    return HttpResponse.json(room);
  }),

  http.post("/api/matches/:matchId/character", async ({ params, request }) => {
    const body = (await request.json()) as { character_id?: unknown };
    if (!isCharacterId(body.character_id) || Object.keys(body).length !== 1)
      return apiError(422, "validation_error");
    const room = findRoom(params.matchId);
    if (!room)
      return apiError(404, "match_not_found");
    const player = room.players.find((seat) => seat.user_id === me.id);
    if (!player)
      return apiError(409, "not_in_match");
    if (room.status !== "lobby")
      return apiError(409, "already_started");
    player.character_id = body.character_id;
    publish({ type: "lobby_update", room });
    return HttpResponse.json(room);
  }),

  http.post("/api/matches/:matchId/start", ({ params }) => {
    const room = findRoom(params.matchId);
    if (!room)
      return apiError(404, "match_not_found");
    if (room.created_by !== me.id)
      return apiError(403, "not_host");
    if (room.status !== "lobby")
      return apiError(409, "already_started");
    if (room.players.length < room.min_players)
      return apiError(409, "not_enough_players");
    if (room.players.some((player) => !player.ready))
      return apiError(409, "not_all_ready");
    room.status = "running";
    // como o #128: o match_started (no servidor, só para quem joga) vem antes do lobby_removed.
    // O mock tem um User só, então manda os dois para todo socket
    publish({ type: "match_started", match_id: room.match_id });
    publish({ type: "lobby_removed", match_id: room.match_id, reason: "started" });
    return new HttpResponse(null, { status: 204 });
  }),
];
