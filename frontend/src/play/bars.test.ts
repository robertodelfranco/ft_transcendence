import { describe, expect, it } from "vitest";
import { fraction, isLowHp } from "./bars";

describe("fraction", () => {
  it("divide o valor pelo máximo", () => {
    expect(fraction(30, 120)).toBe(0.25);
  });

  it("limita entre 0 e 1, sem mexer no número mostrado", () => {
    expect(fraction(150, 100)).toBe(1);
    expect(fraction(-5, 100)).toBe(0);
  });

  it("sem máximo positivo (antes do welcome) não há barra", () => {
    expect(fraction(0, 0)).toBeNull();
  });
});

describe("isLowHp", () => {
  it.each([
    [25, 100, true],
    [26, 100, false],
    [1, 100, true],
    [0, 100, false], // morto não é vida baixa: o aviso de morte é outro
    [0, 0, false], // antes do welcome
  ])("%i de %i: %s", (hp, maxHp, low) => {
    expect(isLowHp({ hp, maxHp })).toBe(low);
  });
});
