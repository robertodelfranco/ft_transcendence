import * as THREE from "three";
import type { BossSnapshot, EnemySnapshot, PlayerSnapshot, ProjectileSnapshot } from "../types";
import type { BillboardAssets, SpriteSheet } from "./billboardAssets";

// Subconjunto estrutural de ViewState: posições já prontas para desenhar.
export interface BillboardView {
  localPlayer: { id: number };
  otherPlayers: readonly PlayerSnapshot[];
  enemies: readonly EnemySnapshot[];
  boss: BossSnapshot | null;
  projectiles: readonly ProjectileSnapshot[];
  grid: readonly string[];
}

interface Clip {
  first: number;
  count: number;
  frameSeconds: number;
  loop: boolean;
}

const idle: Clip = { first: 0, count: 3, frameSeconds: 0.3, loop: true };
const still: Clip = { first: 0, count: 1, frameSeconds: 1, loop: false };
const enemyClips: Record<EnemySnapshot["state"], Clip> = {
  alert: idle,
  attack: { first: 3, count: 4, frameSeconds: 0.35, loop: true },
  dying: { first: 7, count: 3, frameSeconds: 0.5, loop: false },
};
const bossClips: Record<BossSnapshot["state"], Clip> = {
  idle, alert: idle,
  attack: { first: 3, count: 4, frameSeconds: 0.3, loop: false },
  dying: { first: 7, count: 3, frameSeconds: 0.4, loop: false },
};
const projectileClips: Record<ProjectileSnapshot["state"], Clip> = {
  moving: still,
  hit: { first: 0, count: 4, frameSeconds: 0.1, loop: false },
};
const pickups = { K: "key", P: "potion", M: "mana", A: "armor" } as const;

interface Entry {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  state: string;
  elapsed: number;
}

export class Billboards {
  readonly object = new THREE.Group();
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly assets: BillboardAssets) {}

  update(view: BillboardView, dt: number): void {
    const seen = new Set<string>();
    const seconds = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    const draw = (
      id: string, state: string, sheet: SpriteSheet, clip: Clip,
      x: number, y: number, height: number, grounded = true, color = 0xffffff,
    ) => {
      seen.add(id);
      let entry = this.entries.get(id);
      if (!entry) {
        const material = new THREE.SpriteMaterial({
          map: sheet.frames[0].texture, transparent: true, alphaTest: 0.05,
          // Transparência não deve bloquear o que estiver atrás do sprite.
          depthWrite: false,
        });
        const sprite = new THREE.Sprite(material);
        entry = { sprite, material, state, elapsed: 0 };
        this.entries.set(id, entry);
        this.object.add(sprite);
      } else if (entry.state !== state) {
        entry.state = state;
        entry.elapsed = 0;
      } else {
        entry.elapsed += seconds;
      }
      const index = Math.floor(entry.elapsed / clip.frameSeconds);
      const frame = sheet.frames[clip.first + (clip.loop
        ? index % clip.count : Math.min(index, clip.count - 1))];
      entry.material.map = frame.texture;
      entry.material.color.setHex(color);
      entry.sprite.scale.set(
        height * frame.width / sheet.referenceHeight,
        height * frame.height / sheet.referenceHeight, 1,
      );
      entry.sprite.center.set(frame.anchorX, grounded ? frame.anchorY : 0.5);
      entry.sprite.position.set(x, grounded ? 0 : 0.5, y);
    };

    for (const enemy of view.enemies) {
      draw(`enemy:${enemy.id}`, enemy.state, this.assets.enemy,
        enemyClips[enemy.state], enemy.x, enemy.y, 0.8);
    }
    if (view.boss) {
      const boss = view.boss;
      draw("boss", boss.state, this.assets.boss, bossClips[boss.state], boss.x, boss.y, 0.95);
    }
    for (const projectile of view.projectiles) {
      // No Theme dungeon, o contrato usa os mesmos PNGs nos dois Projectiles.
      draw(`projectile:${projectile.id}`, `${projectile.kind}:${projectile.state}`,
        this.assets.fireball, projectileClips[projectile.state],
        projectile.x, projectile.y, 0.18, false);
    }
    for (const player of view.otherPlayers) {
      if (player.id === view.localPlayer.id || !player.alive) continue;
      draw(`player:${player.id}`, "idle", this.assets.player, still,
        player.x, player.y, 0.8, true, player.connected ? 0xffffff : 0x777777);
    }
    view.grid.forEach((row, y) => {
      [...row].forEach((cell, x) => {
        if (!(cell in pickups)) return;
        const kind = pickups[cell as keyof typeof pickups];
        draw(`pickup:${x},${y}`, kind, this.assets[kind], still, x + 0.5, y + 0.5, 0.2);
      });
    });
    // Remover por identidade evita manter cadáveres, tiros e Pickups coletados.
    for (const [id, entry] of this.entries) {
      if (seen.has(id)) continue;
      entry.sprite.removeFromParent();
      entry.material.dispose();
      this.entries.delete(id);
    }
  }

  dispose(): void {
    this.object.removeFromParent();
    for (const entry of this.entries.values()) entry.material.dispose();
    this.entries.clear();
    this.object.clear();
    // Texturas e geometria compartilhada de THREE.Sprite não pertencem aqui.
  }
}
