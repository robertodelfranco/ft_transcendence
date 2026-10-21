import { describe, expect, it } from "vitest";
import type { RoomInfo } from "../api/types";
import roomsFixture from "../mocks/fixtures/rooms.json";
import type { AppServerMessage } from "../ws/appSocket";
import { applyLobbyMessage } from "./applyLobbyMessage";

const [room12, room13] = roomsFixture.items as RoomInfo[];
const update = (room: RoomInfo): AppServerMessage => ({ v: 1, type: "lobby_update", room });
const removed = (matchId: number): AppServerMessage =>
  ({ v: 1, type: "lobby_removed", match_id: matchId, reason: "aborted" });

describe("applyLobbyMessage", () => {
  it("lobby_update de uma Room conhecida a substitui no mesmo lugar", () => {
    const changed = { ...room12, players: [] };
    expect(applyLobbyMessage([room12, room13], update(changed))).toEqual([changed, room13]);
  });

  it("lobby_update de uma Room nova a acrescenta no fim", () => {
    expect(applyLobbyMessage([room12], update(room13))).toEqual([room12, room13]);
  });

  it("lobby_removed tira a Room, e de Room desconhecida não muda nada", () => {
    expect(applyLobbyMessage([room12, room13], removed(12))).toEqual([room13]);
    expect(applyLobbyMessage([room13], removed(12))).toEqual([room13]);
  });

  it("outras mensagens devolvem a mesma lista", () => {
    const rooms = [room12];
    expect(applyLobbyMessage(rooms, { v: 1, type: "presence", user_id: 9, online: true })).toBe(rooms);
  });

  it("não muda a lista que recebeu", () => {
    const rooms = [room12];
    applyLobbyMessage(rooms, update(room13));
    expect(rooms).toEqual([room12]);
  });

  it("as mensagens guardadas durante o GET entram na ordem em que chegaram", () => {
    const buffered = [removed(12), update({ ...room12, max_players: 2 })];
    // a Room 12 sai e volta: a ordem importa
    expect(buffered.reduce(applyLobbyMessage, [room12, room13]).map((room) => room.match_id))
      .toEqual([13, 12]);
  });
});
