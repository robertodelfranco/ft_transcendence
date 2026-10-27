import { describe, expect, it } from "vitest";
import { hudState } from "../mocks/game";
import { deathNotice } from "./notices";

describe("deathNotice", () => {
  it("morto no coop espera o fim da partida", () => {
    expect(deathNotice(hudState({ alive: false, hp: 0, mode: "coop" }))).toBe("coop");
  });

  it("morto no pvp espera o respawn", () => {
    expect(deathNotice(hudState({ alive: false, hp: 0, mode: "pvp" }))).toBe("pvp");
  });

  it("vivo não tem aviso", () => {
    expect(deathNotice(hudState({ alive: true }))).toBeNull();
  });

  it("os zeros de antes do primeiro Snapshot não são morte", () => {
    expect(deathNotice(hudState({ alive: false, hp: 0, maxHp: 0 }))).toBeNull();
  });

  it("sem Mode conhecido não tem aviso", () => {
    expect(deathNotice(hudState({ alive: false, hp: 0, mode: null }))).toBeNull();
  });

  it("fora do running quem fala é o aviso de conexão", () => {
    expect(deathNotice(hudState({ alive: false, hp: 0, status: "disconnected" }))).toBeNull();
  });
});
