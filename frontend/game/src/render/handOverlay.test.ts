import { expect, it } from "vitest";
import { handBob, handKick } from "./handOverlay";

it("parado, a mão não balança; andando, mergulha a cada passo e vai e volta a cada dois", () => {
  expect(handBob(1.23, 0).x).toBeCloseTo(0);
  expect(handBob(1.23, 0).y).toBeCloseTo(0);
  const midStep = handBob(0.35, 1); // meio do primeiro passo de 0,7
  expect(midStep.y).toBeCloseTo(-0.012);
  expect(midStep.x).toBeCloseTo(0.015);
  expect(handBob(0.7, 1).y).toBeCloseTo(0); // pé no chão: mão no lugar
  expect(handBob(1.05, 1).x).toBeCloseTo(-0.015); // segundo passo: para o outro lado
  // nunca sobe: subir abriria um vão entre a mão e a borda da tela
  for (let travel = 0; travel < 3; travel += 0.05) expect(handBob(travel, 1).y).toBeLessThanOrEqual(0);
});

it("o recuo vai de 1 no tiro a 0 em 0,12 s", () => {
  expect(handKick(null)).toBe(0);
  expect(handKick(0)).toBe(1);
  expect(handKick(0.06)).toBeCloseTo(0.5);
  expect(handKick(0.12)).toBe(0);
  expect(handKick(-1)).toBe(0);
});
