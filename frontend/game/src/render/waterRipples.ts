import * as THREE from "three";
import type { BossSnapshot, EnemySnapshot, PlayerSnapshot } from "../types";

// Subconjunto estrutural de ViewState: quem está dentro da água.
export interface RippleView {
  localPlayer: Pick<PlayerSnapshot, "id" | "alive">;
  camera: { x: number; y: number };
  otherPlayers: readonly Pick<PlayerSnapshot, "id" | "x" | "y" | "alive">[];
  enemies: readonly Pick<EnemySnapshot, "id" | "x" | "y">[];
  boss: Pick<BossSnapshot, "x" | "y"> | null;
}

const SIZE = 64; // px da textura num plano de 1×1: 1 px ≈ 0,016, perto do texel dos sprites
const RADII = [8, 14, 20, 26]; // um quadro por raio; o maior chega a ~0,41 de mundo
export const LIFE = 1.2; // segundos de vida de um anel
export const MOVING_EVERY = 0.3; // quem anda deixa um rastro de anéis
export const IDLE_EVERY = 1.4; // quem está parado ainda mexe a água, mais devagar
const MOVE_EPSILON = 0.002; // deslocamento mínimo por quadro para contar como andando
const CAPACITY = 64;
const OPACITY = 0.7;
const LIFT = 0.002; // acima do plano da água, sem z-fighting
const BOSS_SCALE = 1.3;

// Anel em pixel art com a paleta da água pintada nas paredes e nos sprites: borda clara por fora,
// azul por dentro, arcos quebrados. Gerado em memória, sem PNG nem canvas.
function ringTexture(radius: number): THREE.DataTexture {
  const data = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = x + 0.5 - SIZE / 2;
      const dy = y + 0.5 - SIZE / 2;
      const distance = Math.hypot(dx, dy);
      if (distance < radius - 2.5 || distance >= radius + 0.5) continue;
      if (Math.sin(Math.atan2(dy, dx) * 5 + radius) < -0.5) continue;
      const light = distance >= radius - 0.5;
      data.set([84, light ? 252 : 84, 252, 255], (y * SIZE + x) * 4);
    }
  }
  const texture = new THREE.DataTexture(data, SIZE, SIZE);
  texture.colorSpace = THREE.SRGBColorSpace;
  // De perto, pixel nítido; de longe e rasante, a mipmap suaviza em vez de piscar.
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

interface Ring {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  age: number;
}

interface Tracker {
  x: number;
  y: number;
  timer: number;
}

// Anéis de ondulação no pé de quem está na água. Só visual: nada aqui volta para a Simulation.
export class WaterRipples {
  readonly object = new THREE.Group();
  private readonly geometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  private readonly textures = RADII.map(ringTexture);
  private readonly rings: Ring[] = [];
  private readonly trackers = new Map<string, Tracker>();

  constructor(private readonly waterLevel: number, private readonly random: () => number = Math.random) {
    for (let i = 0; i < CAPACITY; i++) {
      const material = new THREE.MeshBasicMaterial({
        map: this.textures[0], transparent: true, depthWrite: false, opacity: OPACITY,
      });
      const mesh = new THREE.Mesh(this.geometry, material);
      // Antes dos sprites: o corpo cobre a metade de trás do anel e a da frente fica sobre a água.
      mesh.renderOrder = -1;
      mesh.visible = false;
      this.rings.push({ mesh, age: 0 });
      this.object.add(mesh);
    }
  }

  update(view: RippleView, dt: number): void {
    const seconds = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    for (const ring of this.rings) {
      if (!ring.mesh.visible) continue;
      ring.age += seconds;
      if (ring.age >= LIFE) {
        ring.mesh.visible = false;
        continue;
      }
      const frame = Math.min(Math.floor(ring.age / (LIFE / RADII.length)), RADII.length - 1);
      ring.mesh.material.map = this.textures[frame];
      ring.mesh.material.opacity = OPACITY * (1 - ring.age / LIFE);
    }

    const seen = new Set<string>();
    const wade = (id: string, x: number, y: number, scale = 1) => {
      seen.add(id);
      let tracker = this.trackers.get(id);
      if (!tracker) {
        // Fase aleatória: entidades paradas não ondulam todas no mesmo instante.
        tracker = { x, y, timer: this.random() * IDLE_EVERY };
        this.trackers.set(id, tracker);
      }
      const moving = Math.hypot(x - tracker.x, y - tracker.y) > MOVE_EPSILON;
      tracker.x = x;
      tracker.y = y;
      if (moving) tracker.timer = Math.min(tracker.timer, MOVING_EVERY);
      tracker.timer -= seconds;
      if (tracker.timer > 0) return;
      tracker.timer = moving ? MOVING_EVERY : IDLE_EVERY;
      this.spawn(x, y, scale);
    };

    if (view.localPlayer.alive) wade("local", view.camera.x, view.camera.y);
    for (const player of view.otherPlayers) {
      if (player.id === view.localPlayer.id || !player.alive) continue;
      wade(`player:${player.id}`, player.x, player.y);
    }
    for (const enemy of view.enemies) wade(`enemy:${enemy.id}`, enemy.x, enemy.y);
    if (view.boss) wade("boss", view.boss.x, view.boss.y, BOSS_SCALE);
    for (const id of this.trackers.keys()) {
      if (!seen.has(id)) this.trackers.delete(id);
    }
  }

  private spawn(x: number, y: number, scale: number): void {
    // Pool cheio: o anel novo é pulado, sem alocar durante o render.
    const ring = this.rings.find((candidate) => !candidate.mesh.visible);
    if (!ring) return;
    ring.age = 0;
    ring.mesh.position.set(x, this.waterLevel + LIFT, y);
    ring.mesh.scale.setScalar(scale);
    ring.mesh.material.map = this.textures[0];
    ring.mesh.material.opacity = OPACITY;
    ring.mesh.visible = true;
  }

  dispose(): void {
    this.object.removeFromParent();
    for (const ring of this.rings) ring.mesh.material.dispose();
    this.rings.length = 0;
    this.trackers.clear();
    this.object.clear();
    this.geometry.dispose();
    for (const texture of this.textures) texture.dispose();
  }
}
