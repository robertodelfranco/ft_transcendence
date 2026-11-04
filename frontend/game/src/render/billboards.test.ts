import * as THREE from "three";
import { expect, it } from "vitest";
import { Billboards } from "./billboards";
import type { BillboardAssets } from "./billboardAssets";

it("dispose libera a geometria compartilhada do THREE.Sprite", () => {
  const frame = { texture: new THREE.Texture(), width: 1, height: 1, anchorX: 0.5, anchorY: 0 };
  const enemy = { frames: Array(10).fill(frame), referenceHeight: 1 };
  const billboards = new Billboards({ enemy } as unknown as BillboardAssets);
  billboards.update({ localPlayer: { id: 1 }, otherPlayers: [], boss: null, projectiles: [], grid: [],
    enemies: [{ id: "e1", x: 1, y: 1, state: "alert" }] }, 0);
  const geometry = (billboards.object.children[0] as THREE.Sprite).geometry;
  let disposed = false;
  geometry.addEventListener("dispose", () => { disposed = true; });
  billboards.dispose();
  expect(disposed).toBe(true);
});
