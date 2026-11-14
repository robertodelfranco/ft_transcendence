import * as THREE from "three";
import type { BossSnapshot, EnemySnapshot, PlayerSnapshot, ProjectileSnapshot } from "../types";
import type { BillboardAssets, SpriteSheet } from "./billboardAssets";
import { playerCharacter } from "../playerCharacters";
import { ENEMY_ATTACK_INTERVAL_S } from "../rules";

// Subconjunto estrutural de ViewState: posições já prontas para desenhar.
export interface BillboardView {
  localPlayer: { id: number; character_id?: string };
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
  attack: { first: 3, count: 4, frameSeconds: ENEMY_ATTACK_INTERVAL_S / 4, loop: true },
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
// Quanto a base afunda abaixo da superfície quando o Theme tem água.
// Enemy: a ondulação pintada no sea_dragon (8–14 texels acima da base) fica na superfície.
const ENEMY_SINK = 0.08;
// Boss: a elipse de água do boss_skeleton termina na base de todos os quadros (linhas 53–60
// no quadro 0), então a âncora é por quadro. 4 texels (≈0,06) cortam a elipse no meio: as
// pernas entram na água com a ondulação em volta.
const BOSS_SINK = 0.06;
// Na morte afunda mais: a poça do respingo final (quadro 9, 9 linhas) parecia flutuar.
const BOSS_DYING_SINK = 0.09;
// key.png e pot.png têm sombra + vão (13 texels ≈ 0,05) sob o item: afundar esconde só isso.
// mana.svg e armor.svg (placeholders) não têm sombra e seriam cortados.
const PICKUP_SINK: Record<(typeof pickups)[keyof typeof pickups], number> = {
  key: 0.05, potion: 0.05, mana: 0, armor: 0,
};

// Todos os quadros com a base do quadro mais baixo: a animação fica presa ao canvas do PNG,
// como no C, e a linha d'água pintada não pula entre os clips. Vale para quadros do mesmo tamanho.
export function alignToSheetBase(sheet: SpriteSheet): SpriteSheet {
  const base = Math.min(...sheet.frames.map((frame) => frame.anchorY));
  return { ...sheet, frames: sheet.frames.map((frame) => ({ ...frame, anchorY: base })) };
}

interface Entry {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  state: string;
  elapsed: number;
}

export class Billboards {
  readonly object = new THREE.Group();
  private readonly entries = new Map<string, Entry>();
  private spriteGeometry: THREE.BufferGeometry | null = null;
  private enemySheet: SpriteSheet | null = null;

  // waterLevel > 0: Enemy, Boss e Pickups ficam logo abaixo da superfície; o Player fica em y=0
  // e a água corta as pernas.
  constructor(private readonly assets: BillboardAssets, private readonly waterLevel = 0) {}

  private sunk(depth: number): number {
    return Math.max(0, this.waterLevel - depth);
  }

  update(view: BillboardView, dt: number): void {
    const seen = new Set<string>();
    const seconds = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    const draw = (
      id: string, state: string, sheet: SpriteSheet, clip: Clip,
      // ground: altura da base do sprite; null centraliza a 0,5 (projéteis).
      x: number, y: number, height: number, ground: number | null, color = 0xffffff,
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
        this.spriteGeometry ??= sprite.geometry;
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
      entry.sprite.center.set(frame.anchorX, ground === null ? 0.5 : frame.anchorY);
      entry.sprite.position.set(x, ground ?? 0.5, y);
    };

    for (const enemy of view.enemies) {
      this.enemySheet ??= alignToSheetBase(this.assets.enemy);
      // Na morte o sea_dragon afunda dentro do PNG (ondulação termina na linha 50 no quadro 8,
      // contra 62 do parado): com a base comum ele flutuaria, então cada quadro usa a sua.
      const sheet = enemy.state === "dying" ? this.assets.enemy : this.enemySheet;
      draw(`enemy:${enemy.id}`, enemy.state, sheet,
        enemyClips[enemy.state], enemy.x, enemy.y, 0.8, this.sunk(ENEMY_SINK));
    }
    if (view.boss) {
      const boss = view.boss;
      draw("boss", boss.state, this.assets.boss, bossClips[boss.state],
        boss.x, boss.y, 0.95, this.sunk(boss.state === "dying" ? BOSS_DYING_SINK : BOSS_SINK));
    }
    for (const projectile of view.projectiles) {
      // O visual em voo depende do autor; impacto e bullet do Boss seguem os assets comuns.
      let sheet = this.assets[projectile.kind];
      const clip = projectileClips[projectile.state];
      if (projectile.kind === "fireball" && projectile.state === "moving") {
        const owner = projectile.owner === view.localPlayer.id
          ? view.localPlayer : view.otherPlayers.find((player) => player.id === projectile.owner);
        if (owner) {
          const character = playerCharacter(owner.character_id);
          sheet = this.assets[`projectile:${character.id}`] ?? sheet;
        }
      }
      const fireballScale = projectile.kind === "fireball" ? 1.2 : 1;
      draw(`projectile:${projectile.id}`, `${projectile.kind}:${projectile.state}`,
        sheet, clip,
        projectile.x, projectile.y, 0.18 * fireballScale, null);
    }
    for (const player of view.otherPlayers) {
      if (player.id === view.localPlayer.id || !player.alive) continue;
      const character = playerCharacter(player.character_id);
      draw(`player:${player.id}`, character.id, this.assets[`player:${character.id}`], still,
        player.x, player.y, 0.8, 0, player.connected ? 0xffffff : 0x777777);
    }
    view.grid.forEach((row, y) => {
      [...row].forEach((cell, x) => {
        if (!(cell in pickups)) return;
        const kind = pickups[cell as keyof typeof pickups];
        // Pickup (0,2 de altura) ancorado em y=0 sumiria inteiro debaixo d'água.
        draw(`pickup:${x},${y}`, kind, this.assets[kind], still,
          x + 0.5, y + 0.5, 0.2, this.sunk(PICKUP_SINK[kind]));
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
    // THREE.Sprite usa uma geometria do módulo: sem dispose, cada WebGLRenderer
    // guarda os buffers dela num WeakMap e fica preso com o canvas.
    this.spriteGeometry?.dispose();
    this.spriteGeometry = null;
    // Texturas pertencem ao AssetLoader.
  }
}
