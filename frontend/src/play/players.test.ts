import { describe, expect, it } from "vitest";
import { nameOf, orderPlayers } from "./players";

const player = (id: number) => ({ id, name: `p${id}`, hp: 10, alive: true, connected: true });

describe("orderPlayers", () => {
  it("Player local primeiro, depois por id crescente", () => {
    const ids = orderPlayers([player(9), player(3), player(7), player(5)], 7).map((p) => p.id);
    expect(ids).toEqual([7, 3, 5, 9]);
  });

  it("sem User local conhecido, só por id", () => {
    const ids = orderPlayers([player(9), player(3), player(7)], null).map((p) => p.id);
    expect(ids).toEqual([3, 7, 9]);
  });

  it("não muda a lista recebida do jogo", () => {
    const list = [player(9), player(3)];
    orderPlayers(list, 3);
    expect(list.map((p) => p.id)).toEqual([9, 3]);
  });
});

describe("nameOf", () => {
  it("acha o nome pelo id", () => {
    expect(nameOf([player(3), player(9)], 9)).toBe("p9");
  });

  it("id fora da lista não tem nome", () => {
    expect(nameOf([player(3)], 12)).toBeUndefined();
  });
});