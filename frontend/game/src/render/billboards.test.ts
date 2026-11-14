import * as THREE from "three";
import { expect, it } from "vitest";
import type { PlayerSnapshot, ProjectileSnapshot } from "../types";
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

it("desenha cada Player com sua sprite e usa Nemesis para um ID desconhecido", () => {
  const sheet = () => ({
    frames: [{ texture: new THREE.Texture(), width: 63, height: 63, anchorX: 0.5, anchorY: 0 }],
    referenceHeight: 63,
  });
  const nemesis = sheet();
  const sucubus = sheet();
  const billboards = new Billboards({ "player:nemesis": nemesis, "player:sucubus": sucubus } as BillboardAssets);
  const player = (id: number, character_id: string): PlayerSnapshot => ({
    id, character_id, name: `p${id}`, x: id, y: 1, dx: 0, dy: -1,
    hp: 10, mana: 100, armor: 0, keys: 0, alive: true, connected: true,
  });
  const view = { localPlayer: { id: 1 }, enemies: [], boss: null, projectiles: [], grid: [],
    otherPlayers: [player(2, "nemesis"), player(3, "sucubus")] };
  billboards.update(view, 0);
  const [first, second] = billboards.object.children as THREE.Sprite[];
  expect(first.material.map).toBe(nemesis.frames[0].texture);
  expect(second.material.map).toBe(sucubus.frames[0].texture);
  billboards.update({ ...view, otherPlayers: [player(2, "future"), player(3, "nemesis")] }, 0);
  expect(first.material.map).toBe(nemesis.frames[0].texture);
  expect(second.material.map).toBe(nemesis.frames[0].texture);
  billboards.dispose();
  nemesis.frames[0].texture.dispose();
  sucubus.frames[0].texture.dispose();
});

it("na água, Enemy, Boss e Pickup ficam logo abaixo da superfície; o Player afunda", () => {
  const sheet = (count: number) => ({
    frames: Array.from({ length: count }, () =>
      ({ texture: new THREE.Texture(), width: 64, height: 64, anchorX: 0.5, anchorY: 0 })),
    referenceHeight: 64,
  });
  const assets = {
    enemy: sheet(10), boss: sheet(10), potion: sheet(1), mana: sheet(1), "player:nemesis": sheet(1),
  };
  const billboards = new Billboards(assets as unknown as BillboardAssets, 0.25);
  const other: PlayerSnapshot = {
    id: 2, character_id: "nemesis", name: "other", x: 3, y: 1, dx: 0, dy: -1,
    hp: 10, mana: 100, armor: 0, keys: 0, alive: true, connected: true,
  };
  billboards.update({
    localPlayer: { id: 1 }, otherPlayers: [other], projectiles: [], grid: ["PM"],
    enemies: [{ id: "e1", x: 1, y: 1, state: "alert" }],
    boss: { x: 2, y: 2, hp: 10, state: "idle" },
  }, 0);
  const [enemy, boss, player, potion, mana] = billboards.object.children as THREE.Sprite[];
  expect(enemy.position.y).toBeCloseTo(0.17);
  expect(potion.position.y).toBeCloseTo(0.2); // só a sombra pintada fica submersa
  expect(mana.position.y).toBe(0.25); // placeholder sem sombra: na superfície
  expect(boss.position.y).toBeCloseTo(0.19);
  expect(player.position.y).toBe(0);
  billboards.update({
    localPlayer: { id: 1 }, otherPlayers: [other], projectiles: [], grid: ["PM"],
    enemies: [{ id: "e1", x: 1, y: 1, state: "alert" }],
    boss: { x: 2, y: 2, hp: 0, state: "dying" },
  }, 0);
  expect(boss.position.y).toBeCloseTo(0.16); // na morte afunda mais
  billboards.dispose();
  for (const item of Object.values(assets)) for (const frame of item.frames) frame.texture.dispose();
});

it("o Enemy usa a base do quadro mais baixo ao andar e atacar, e a própria ao morrer", () => {
  const frame = (anchorY: number) =>
    ({ texture: new THREE.Texture(), width: 64, height: 64, anchorX: 0.5, anchorY });
  // Quadro 0 (alert) desce mais que os de ataque, como as garras do sea_dragon;
  // o quadro 7 (dying) termina bem mais acima no PNG.
  const enemy = {
    frames: [frame(0.02), ...Array.from({ length: 6 }, () => frame(0.08)), frame(0.2), frame(0.2), frame(0.2)],
    referenceHeight: 62,
  };
  const billboards = new Billboards({ enemy } as unknown as BillboardAssets);
  const view = { localPlayer: { id: 1 }, otherPlayers: [], boss: null, projectiles: [], grid: [] };
  billboards.update({ ...view, enemies: [{ id: "e1", x: 1, y: 1, state: "alert" }] }, 0);
  const sprite = billboards.object.children[0] as THREE.Sprite;
  expect(sprite.center.y).toBe(0.02);
  billboards.update({ ...view, enemies: [{ id: "e1", x: 1, y: 1, state: "attack" }] }, 0);
  expect(sprite.material.map).toBe(enemy.frames[3].texture);
  expect(sprite.center.y).toBe(0.02);
  billboards.update({ ...view, enemies: [{ id: "e1", x: 1, y: 1, state: "dying" }] }, 0);
  expect(sprite.material.map).toBe(enemy.frames[7].texture);
  expect(sprite.center.y).toBe(0.2);
  billboards.dispose();
  for (const item of enemy.frames) item.texture.dispose();
});

it.each(["local", "remote"])("usa o projétil da Sucubus do Player %s e preserva impacto e bullet", (source) => {
  const frame = () => ({ texture: new THREE.Texture(), width: 34, height: 31, anchorX: 0.5, anchorY: 0 });
  const fireball = { frames: Array.from({ length: 4 }, frame), referenceHeight: 31 };
  const bullet = { frames: Array.from({ length: 4 }, frame), referenceHeight: 31 };
  const sucubus = { frames: [frame()], referenceHeight: 31 };
  const billboards = new Billboards({ fireball, bullet, "projectile:sucubus": sucubus } as BillboardAssets);
  const other: PlayerSnapshot = {
    id: 2, character_id: "sucubus", name: "other", x: 2, y: 1, dx: 0, dy: -1,
    hp: 0, mana: 100, armor: 0, keys: 0, alive: false, connected: true,
  };
  const projectile: ProjectileSnapshot = {
    id: "f1", kind: "fireball", state: "moving", owner: source === "local" ? 1 : 2,
    x: 2, y: 2, dx: 0, dy: -1,
  };
  const view = {
    localPlayer: { id: 1, character_id: source === "local" ? "sucubus" : "nemesis" },
    otherPlayers: [other], enemies: [], boss: null, projectiles: [projectile], grid: [],
  };
  billboards.update(view, 0);
  const sprite = billboards.object.children[0] as THREE.Sprite;
  expect(sprite.material.map).toBe(sucubus.frames[0].texture);
  billboards.update({ ...view, projectiles: [{ ...projectile, state: "hit" }] }, 0);
  expect(sprite.material.map).toBe(fireball.frames[0].texture);
  billboards.update({ ...view, projectiles: [{ ...projectile, kind: "bullet", owner: null }] }, 0);
  expect(sprite.material.map).toBe(bullet.frames[0].texture);
  billboards.update({ ...view, projectiles: [{ ...projectile, owner: 99 }] }, 0);
  expect(sprite.material.map).toBe(fireball.frames[0].texture);
  billboards.dispose();
  for (const sheet of [fireball, bullet, sucubus]) {
    for (const item of sheet.frames) item.texture.dispose();
  }
});
