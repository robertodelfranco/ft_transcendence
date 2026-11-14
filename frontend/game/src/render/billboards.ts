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
  camera: { x: number; y: number };
}

interface Clip {
  first: number;
  count: number;
  frameSeconds: number;
  loop: boolean;
  // Células andadas por quadro: o passo acompanha o chão e para quando a entidade para.
  // Sem stride, o quadro avança com o tempo.
  stride?: number;
}

const idle: Clip = { first: 0, count: 3, frameSeconds: 0.3, loop: true };
const still: Clip = { first: 0, count: 1, frameSeconds: 1, loop: false };
// 0,66 célula por quadro: o ritmo de antes (0,3 s a 2,2 cél/s), que a #265 acelerou para 3,0.
const walk: Clip = { ...idle, stride: 0.66 };
const enemyClips: Record<EnemySnapshot["state"], Clip> = {
  alert: walk,
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
// Pickups flutuam ±0,02 em torno de 0,02 acima da base: o item nunca entra no chão nem na água.
// No dungeon a base de key e potion também fica 0,05 abaixo do chão, que esconde a sombra pintada:
// uma sombra que sobe junto com o item pareceria solta.
const PICKUP_FLOAT = 0.02;
const PICKUP_FLOAT_SPEED = 2.5; // rad/s, um ciclo a cada ~2,5 s
// Outros Players: um pulinho por passo, no mesmo passo do som de passos (mount.ts).
const PLAYER_HOP = 0.03;
const PLAYER_STEP = 0.7;
const MOTION_FADE_S = 0.15; // o pulinho some em vez de parar no ar
const STEP_MAX = 0.5; // salto maior que isso (respawn, reconexão) não é passo
// Boss: o HP vem no Snapshot; quando cai, o sprite pisca em vermelho. Cor acima de 1 (HDR): um tom
// multiplicado não aparece no boss_mage, que já é vermelho; acima de 1 ele clareia e passa pelo bloom.
const BOSS_FLASH_S = 0.12;
const BOSS_FLASH_RGB = [2.5, 0.8, 0.8] as const;
// Colado na câmera, um sprite vira um borrão de pixels gigantes (aliado ou fireball atravessando o
// Player): a opacidade cai de 1 em NEAR_FADE_START até 0 em NEAR_FADE_END. Um Player (0,8 de altura)
// já cobre a tela inteira a ~0,5 da câmera (meia altura visível a d é 0,58·d, e ele passa 0,3 acima
// dela), por isso o fade começa em 0,6.
const NEAR_FADE_START = 0.6;
const NEAR_FADE_END = 0.2;

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
  x: number;
  y: number;
  travel: number; // células andadas desde a troca de estado
  motion: number; // 0 parado, 1 andando, com transição de MOTION_FADE_S
}

export class Billboards {
  readonly object = new THREE.Group();
  private readonly entries = new Map<string, Entry>();
  private spriteGeometry: THREE.BufferGeometry | null = null;
  private enemySheet: SpriteSheet | null = null;
  private bossHp: number | null = null;
  private bossFlash = 0; // segundos restantes do flash de dano

  // waterLevel > 0: Enemy, Boss e Pickups ficam logo abaixo da superfície; o Player fica em y=0
  // e a água corta as pernas.
  constructor(
    private readonly assets: BillboardAssets,
    private readonly waterLevel = 0,
    private readonly bulletTint = 0xffffff,
  ) {}

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
    ): Entry => {
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
        entry = { sprite, material, state, elapsed: 0, x, y, travel: 0, motion: 0 };
        this.entries.set(id, entry);
        this.object.add(sprite);
      } else if (entry.state !== state) {
        entry.state = state;
        entry.elapsed = 0;
        entry.travel = 0;
      } else {
        entry.elapsed += seconds;
      }
      const step = Math.hypot(x - entry.x, y - entry.y);
      const walking = step > 0 && step < STEP_MAX;
      if (walking) entry.travel += step;
      entry.motion = Math.min(1, Math.max(0, entry.motion + (walking ? seconds : -seconds) / MOTION_FADE_S));
      entry.x = x;
      entry.y = y;
      const index = Math.floor(clip.stride
        ? entry.travel / clip.stride : entry.elapsed / clip.frameSeconds);
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
      const near = Math.hypot(x - view.camera.x, y - view.camera.y);
      entry.material.opacity = Math.min(1, Math.max(0,
        (near - NEAR_FADE_END) / (NEAR_FADE_START - NEAR_FADE_END)));
      entry.sprite.visible = entry.material.opacity > 0;
      return entry;
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
      this.bossFlash = Math.max(0, this.bossFlash - seconds);
      if (this.bossHp !== null && boss.hp < this.bossHp) this.bossFlash = BOSS_FLASH_S;
      this.bossHp = boss.hp;
      const entry = draw("boss", boss.state, this.assets.boss, bossClips[boss.state],
        boss.x, boss.y, 0.95, this.sunk(boss.state === "dying" ? BOSS_DYING_SINK : BOSS_SINK));
      if (this.bossFlash > 0) entry.material.color.setRGB(...BOSS_FLASH_RGB);
    } else this.bossHp = null;
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
        projectile.x, projectile.y, 0.18 * fireballScale, null,
        projectile.kind === "bullet" ? this.bulletTint : 0xffffff);
    }
    for (const player of view.otherPlayers) {
      if (player.id === view.localPlayer.id || !player.alive) continue;
      const character = playerCharacter(player.character_id);
      const entry = draw(`player:${player.id}`, character.id, this.assets[`player:${character.id}`],
        still, player.x, player.y, 0.8, 0, player.connected ? 0xffffff : 0x777777);
      entry.sprite.position.y += PLAYER_HOP * entry.motion
        * Math.abs(Math.sin(entry.travel * Math.PI / PLAYER_STEP));
    }
    view.grid.forEach((row, y) => {
      [...row].forEach((cell, x) => {
        if (!(cell in pickups)) return;
        const kind = pickups[cell as keyof typeof pickups];
        // Pickup (0,2 de altura) ancorado em y=0 sumiria inteiro debaixo d'água.
        const entry = draw(`pickup:${x},${y}`, kind, this.assets[kind], still,
          x + 0.5, y + 0.5, 0.2, this.waterLevel - PICKUP_SINK[kind] + PICKUP_FLOAT);
        // Fase pela célula: os Pickups não sobem todos juntos.
        entry.sprite.position.y += PICKUP_FLOAT * Math.sin(entry.elapsed * PICKUP_FLOAT_SPEED + x + y);
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
