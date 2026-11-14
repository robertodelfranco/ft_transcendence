import type * as THREE from "three";
import { expect, it } from "vitest";
import { IDLE_EVERY, LIFE, MOVING_EVERY, WaterRipples, type RippleView } from "./waterRipples";

const visible = (ripples: WaterRipples) =>
  (ripples.object.children as THREE.Mesh[]).filter((mesh) => mesh.visible);

const view = (enemyX: number, extra: Partial<RippleView> = {}): RippleView => ({
  localPlayer: { id: 1, alive: false }, camera: { x: 0, y: 0 }, otherPlayers: [], boss: null,
  enemies: [{ id: "e1", x: enemyX, y: 1 }], ...extra,
});

it("parado ondula a cada IDLE_EVERY; andando, a cada MOVING_EVERY", () => {
  const ripples = new WaterRipples(0.2, () => 0); // fase zero: o primeiro anel sai já
  ripples.update(view(1), 0);
  expect(visible(ripples)).toHaveLength(1);
  expect(visible(ripples)[0].position.toArray()).toEqual([1, 0.202, 1]);
  ripples.update(view(1), IDLE_EVERY / 2);
  expect(visible(ripples)).toHaveLength(1);
  ripples.update(view(1.1), MOVING_EVERY); // começou a andar: não espera o resto do IDLE_EVERY
  expect(visible(ripples)).toHaveLength(2);
  ripples.dispose();
});

it("o anel some depois de LIFE e quem saiu da água para de ondular", () => {
  const ripples = new WaterRipples(0.2, () => 0);
  ripples.update(view(1), 0);
  ripples.update({ ...view(1), enemies: [] }, LIFE);
  expect(visible(ripples)).toHaveLength(0);
  ripples.dispose();
});

it("o Player local ondula na posição da câmera, e só vivo", () => {
  const ripples = new WaterRipples(0.2, () => 0);
  ripples.update(view(1, { enemies: [], localPlayer: { id: 1, alive: true }, camera: { x: 3, y: 4 } }), 0);
  expect(visible(ripples).map((mesh) => [mesh.position.x, mesh.position.z])).toEqual([[3, 4]]);
  ripples.update(view(1, { enemies: [], localPlayer: { id: 1, alive: false } }), LIFE);
  expect(visible(ripples)).toHaveLength(0);
  ripples.dispose();
});
