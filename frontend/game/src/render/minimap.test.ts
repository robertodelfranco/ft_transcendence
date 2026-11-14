import { expect, test, vi } from "vitest";
import type { PlayerSnapshot } from "../types";
import type { ViewState } from "./renderer";
import { clampToRadar, drawMinimap, headingUpAngle, VIEW_RADIUS_CELLS } from "./minimap";

const player: PlayerSnapshot = {
  id: 7, name: "ana", character_id: "nemesis", x: 1.5, y: 1.5, dx: 0, dy: -1,
  hp: 10, mana: 100, armor: 0, keys: 0, alive: true, connected: true,
};

function view(dx: number, dy: number, grid = ["111", "1D0", "1O1"]): ViewState {
  return {
    localPlayer: player,
    otherPlayers: [{ ...player, id: 8, x: 2.5, y: 1.5 }],
    enemies: [], boss: null, projectiles: [], doors: [],
    grid,
    camera: { x: 1.5, y: 1.5, dx, dy, pitch: 0 },
  };
}

function context() {
  const fills: Array<{ x: number; y: number; color: string }> = [];
  const ctx = {
    fillStyle: "",
    clearRect: vi.fn(),
    strokeRect: vi.fn(),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    fillRect: vi.fn(function (this: { fillStyle: string }, x: number, y: number) {
      fills.push({ x, y, color: this.fillStyle });
    }),
    save: vi.fn(), restore: vi.fn(), translate: vi.fn(), scale: vi.fn(), rotate: vi.fn(), clip: vi.fn(),
    beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(),
    fill: vi.fn(), arc: vi.fn(), stroke: vi.fn(),
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls: ctx, fills };
}

test("the cone follows the scene's north and east directions", () => {
  const north = context();
  drawMinimap(north.ctx, view(0, -1), 90, 90, 16 / 9);
  // os dois primeiros lineTo são o cone; os três seguintes, o losango do norte na borda
  const northSides = north.calls.lineTo.mock.calls.slice(0, 2);
  expect(northSides[0][1]).toBeLessThan(1.5);
  expect(northSides[1][1]).toBeLessThan(1.5);

  const east = context();
  drawMinimap(east.ctx, view(1, 0), 90, 90, 16 / 9);
  const eastSides = east.calls.lineTo.mock.calls.slice(0, 2);
  expect(eastSides[0][0]).toBeGreaterThan(1.5);
  expect(eastSides[1][0]).toBeGreaterThan(1.5);
  expect(Math.abs((eastSides[0][1] - 1.5) / (eastSides[0][0] - 1.5)))
    .toBeCloseTo(Math.tan(Math.PI / 6) * 16 / 9);
});

test("the current Grid distinguishes closed and opened Doors and draws both Players", () => {
  const { ctx, calls, fills } = context();
  drawMinimap(ctx, view(0, -1), 90, 90, 16 / 9);

  expect(fills.find(({ x, y }) => x === 1 && y === 1)?.color).toBe("#d9a354");
  expect(fills.find(({ x, y }) => x === 1 && y === 2)?.color).toBe("#426e69");
  // O primeiro arc é o recorte redondo do radar; o Player local tem um anel além do marcador.
  expect(calls.arc.mock.calls.map(([x, y]) => [x, y])).toEqual([[45, 45], [2.5, 1.5], [1.5, 1.5], [1.5, 1.5]]);
  expect(calls.clip).toHaveBeenCalledOnce();
});

test("the radar turns so the Player's heading points up", () => {
  expect(headingUpAngle(0, -1)).toBeCloseTo(0);
  // olhando para leste, o mapa gira 90° no sentido anti-horário: o leste vai para o topo
  expect(headingUpAngle(1, 0)).toBeCloseTo(-Math.PI / 2);
  for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0], [Math.SQRT1_2, Math.SQRT1_2]]) {
    const a = headingUpAngle(dx, dy);
    // rotação do canvas (y para baixo) aplicada ao olhar: sempre (0, -1), o topo
    expect(dx * Math.cos(a) - dy * Math.sin(a)).toBeCloseTo(0);
    expect(dx * Math.sin(a) + dy * Math.cos(a)).toBeCloseTo(-1);
  }

  const east = context();
  drawMinimap(east.ctx, view(1, 0), 90, 90, 16 / 9);
  expect(east.calls.rotate).toHaveBeenCalledWith(headingUpAngle(1, 0));
});

test("a far teammate sticks to the edge, in its direction", () => {
  expect(clampToRadar(3, 1, 1, 1, 5)).toEqual({ x: 3, y: 1, clamped: false });
  const far = clampToRadar(21, 1, 1, 1, 5);
  expect(far.clamped).toBe(true);
  expect(far.x).toBeCloseTo(6);
  expect(far.y).toBeCloseTo(1);
});

test("only the cells around the Player are drawn, not the whole map", () => {
  const big = Array.from({ length: 60 }, () => "0".repeat(60));
  const { ctx, fills } = context();
  drawMinimap(ctx, { ...view(0, -1, big), camera: { x: 30.5, y: 30.5, dx: 0, dy: -1, pitch: 0 } }, 90, 90, 16 / 9);
  const cells = fills.filter(({ x, y }) => Number.isInteger(x) && Number.isInteger(y) && !(x === 0 && y === 0));
  expect(cells.length).toBeGreaterThan(0);
  const reach = Math.ceil(VIEW_RADIUS_CELLS * Math.SQRT2) + 1;
  for (const { x, y } of cells) {
    expect(Math.abs(x - 30)).toBeLessThanOrEqual(reach);
    expect(Math.abs(y - 30)).toBeLessThanOrEqual(reach);
  }
});
