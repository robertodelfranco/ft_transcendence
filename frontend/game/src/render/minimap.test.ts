import { expect, test, vi } from "vitest";
import type { PlayerSnapshot } from "../types";
import type { ViewState } from "./renderer";
import { drawMinimap } from "./minimap";

const player: PlayerSnapshot = {
  id: 7, name: "ana", x: 1.5, y: 1.5, dx: 0, dy: -1,
  hp: 10, mana: 100, armor: 0, keys: 0, alive: true, connected: true,
};

function view(dx: number, dy: number): ViewState {
  return {
    localPlayer: player,
    otherPlayers: [{ ...player, id: 8, x: 2.5, y: 1.5 }],
    enemies: [], boss: null, projectiles: [], doors: [],
    grid: ["111", "1D0", "1O1"],
    camera: { x: 1.5, y: 1.5, dx, dy, pitch: 0 },
  };
}

function context() {
  const fills: Array<{ x: number; y: number; color: string }> = [];
  const ctx = {
    fillStyle: "",
    clearRect: vi.fn(),
    fillRect: vi.fn(function (this: { fillStyle: string }, x: number, y: number) {
      fills.push({ x, y, color: this.fillStyle });
    }),
    save: vi.fn(), restore: vi.fn(), translate: vi.fn(), scale: vi.fn(),
    beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(),
    fill: vi.fn(), arc: vi.fn(), stroke: vi.fn(),
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls: ctx, fills };
}

test("the cone follows the scene's north and east directions", () => {
  const north = context();
  drawMinimap(north.ctx, view(0, -1), 90, 90, 16 / 9);
  const northSides = north.calls.lineTo.mock.calls;
  expect(northSides).toHaveLength(2);
  expect(northSides[0][1]).toBeLessThan(1.5);
  expect(northSides[1][1]).toBeLessThan(1.5);

  const east = context();
  drawMinimap(east.ctx, view(1, 0), 90, 90, 16 / 9);
  const eastSides = east.calls.lineTo.mock.calls;
  expect(eastSides[0][0]).toBeGreaterThan(1.5);
  expect(eastSides[1][0]).toBeGreaterThan(1.5);
  expect(Math.abs((eastSides[0][1] - 1.5) / (eastSides[0][0] - 1.5)))
    .toBeCloseTo(Math.tan(Math.PI / 6) * 16 / 9);
});

test("the current Grid distinguishes closed and opened Doors and draws both Players", () => {
  const { ctx, calls, fills } = context();
  drawMinimap(ctx, view(0, -1), 90, 90, 16 / 9);

  expect(fills.find(({ x, y }) => x === 1 && y === 1)?.color).toBe("#c48c4c");
  expect(fills.find(({ x, y }) => x === 1 && y === 2)?.color).toBe("#4c7965");
  expect(calls.arc.mock.calls.map(([x, y]) => [x, y])).toEqual([[2.5, 1.5], [1.5, 1.5]]);
});
