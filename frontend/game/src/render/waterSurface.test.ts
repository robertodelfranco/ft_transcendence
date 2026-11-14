import { expect, it } from "vitest";
import { BASE, FLOW, PALETTE, SIZE, createWaterTexture, flowWater } from "./waterSurface";

const pixels = (data: Uint8Array) =>
  Array.from({ length: SIZE * SIZE }, (_, i) => Array.from(data.slice(i * 4, i * 4 + 3)).join(","));

it("uma célula de textura por célula do Grid, só com a paleta da água pintada", () => {
  const texture = createWaterTexture(30, 20);
  expect(texture.repeat.toArray()).toEqual([30, 20]);
  const allowed = new Set([BASE, ...PALETTE].map((color) => color.join(",")));
  const colors = pixels(texture.image.data as Uint8Array);
  expect(colors.every((color) => allowed.has(color))).toBe(true);
  // quase lisa: os traços são poucos, o fundo azul domina
  expect(colors.filter((color) => color === BASE.join(",")).length / colors.length).toBeGreaterThan(0.9);
  texture.dispose();
});

it("o desenho é o mesmo a cada partida", () => {
  const a = createWaterTexture(1, 1);
  const b = createWaterTexture(1, 1);
  expect(pixels(a.image.data as Uint8Array)).toEqual(pixels(b.image.data as Uint8Array));
  a.dispose();
  b.dispose();
});

it("a correnteza anda por segundo, não por quadro, e o offset volta a 0 depois de 1", () => {
  const texture = createWaterTexture(1, 1);
  flowWater(texture, 1);
  expect(texture.offset.x).toBeCloseTo(FLOW.x);
  expect(texture.offset.y).toBeCloseTo(FLOW.y);
  flowWater(texture, 1 / FLOW.x); // mais uma volta inteira em x
  expect(texture.offset.x).toBeCloseTo(FLOW.x);
  flowWater(texture, Number.NaN); // dt inválido não move
  expect(texture.offset.x).toBeCloseTo(FLOW.x);
  texture.dispose();
});
