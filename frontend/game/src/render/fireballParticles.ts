import * as THREE from "three";
import type { ProjectileSnapshot } from "../types";

const CAPACITY = 512;
const TRAIL_INTERVAL = 1 / 30;
const TRAIL_LIFE = 0.25;
const IMPACT_LIFE = 0.4;
const IMPACT_COUNT = 18;

interface Source {
  state: ProjectileSnapshot["state"];
  x: number;
  y: number;
  remainder: number;
}

export class FireballParticles {
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material = new THREE.PointsMaterial({
    color: new THREE.Color(3, 3, 3), // Intensidade HDR para os pontos alimentarem o bloom.
    size: 0.035, sizeAttenuation: true, vertexColors: true,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  readonly object = new THREE.Points(this.geometry, this.material);
  private readonly positions = new Float32Array(CAPACITY * 3);
  private readonly velocities = new Float32Array(CAPACITY * 3);
  private readonly life = new Float32Array(CAPACITY);
  private readonly lifetime = new Float32Array(CAPACITY);
  private readonly drawPositions = new THREE.BufferAttribute(new Float32Array(CAPACITY * 3), 3);
  private readonly drawColors = new THREE.BufferAttribute(new Float32Array(CAPACITY * 3), 3);
  private sources = new Map<string, Source>();
  private cursor = 0;
  private disposed = false;

  constructor() {
    this.drawPositions.setUsage(THREE.DynamicDrawUsage);
    this.drawColors.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute("position", this.drawPositions);
    this.geometry.setAttribute("color", this.drawColors);
    this.geometry.setDrawRange(0, 0);
    // As posições mudam no pool; um bounding sphere antigo descartaria efeitos visíveis.
    this.object.frustumCulled = false;
  }

  update(projectiles: readonly ProjectileSnapshot[], dt: number): void {
    if (this.disposed || !Number.isFinite(dt) || dt < 0) return;
    // Envelhece também quando o Projectile já saiu do ViewState.
    for (let i = 0; i < CAPACITY; i++) {
      this.life[i] = Math.max(0, this.life[i] - dt);
      if (this.life[i] === 0) continue;
      const offset = i * 3;
      this.positions[offset] += this.velocities[offset] * dt;
      this.positions[offset + 1] += this.velocities[offset + 1] * dt;
      this.positions[offset + 2] += this.velocities[offset + 2] * dt;
    }

    const nextSources = new Map<string, Source>();
    for (const projectile of projectiles) {
      if (projectile.kind !== "fireball") continue;
      const previous = this.sources.get(projectile.id);
      let remainder = 0;
      if (projectile.state === "moving") {
        // Limita emissão após aba suspensa, sem acumular segundos de rastro atrasado.
        const elapsed = (previous?.remainder ?? 0) + Math.min(dt, 0.1);
        const count = Math.floor(elapsed / TRAIL_INTERVAL);
        remainder = elapsed - count * TRAIL_INTERVAL;
        // Não desenha uma linha de fogo atravessando um salto de Reconnection.
        const continuous = previous?.state === "moving" && dt <= 0.1
          && Math.hypot(projectile.x - previous.x, projectile.y - previous.y) <= 1;
        for (let i = 0; i < count; i++) {
          const fraction = (i + 1) / (count + 1);
          const x = continuous ? THREE.MathUtils.lerp(previous.x, projectile.x, fraction) : projectile.x;
          const y = continuous ? THREE.MathUtils.lerp(previous.y, projectile.y, fraction) : projectile.y;
          this.emit(x, y, TRAIL_LIFE,
            -projectile.dx * 0.12 + (Math.random() - 0.5) * 0.12,
            0.08 + Math.random() * 0.12,
            -projectile.dy * 0.12 + (Math.random() - 0.5) * 0.12);
        }
      } else if (previous?.state !== "hit") {
        // Primeiro hit observado também gera efeito; hit repetido não gera outro.
        for (let i = 0; i < IMPACT_COUNT; i++) {
          const angle = Math.random() * Math.PI * 2;
          const vertical = Math.random() * 2 - 1;
          const horizontal = Math.sqrt(1 - vertical * vertical);
          const speed = 0.3 + Math.random() * 0.5;
          this.emit(projectile.x, projectile.y, IMPACT_LIFE,
            Math.cos(angle) * horizontal * speed, vertical * speed,
            Math.sin(angle) * horizontal * speed);
        }
      }
      nextSources.set(projectile.id, {
        state: projectile.state, x: projectile.x, y: projectile.y, remainder,
      });
    }
    // Ausentes saem do histórico; não inferir impacto do desaparecimento.
    this.sources = nextSources;
    this.upload();
  }

  private emit(x: number, y: number, duration: number, vx: number, vy: number, vz: number): void {
    // Ao lotar, reutiliza a posição mais antiga; nunca expande buffers da GPU.
    const index = this.cursor;
    this.cursor = (index + 1) % CAPACITY;
    const offset = index * 3;
    this.positions[offset] = x;
    this.positions[offset + 1] = 0.5; // Mesma altura do billboard da fireball.
    this.positions[offset + 2] = y;
    this.velocities[offset] = vx;
    this.velocities[offset + 1] = vy;
    this.velocities[offset + 2] = vz;
    this.life[index] = this.lifetime[index] = duration;
  }

  private upload(): void {
    let count = 0;
    for (let i = 0; i < CAPACITY; i++) {
      if (this.life[i] <= 0) continue;
      const offset = i * 3;
      this.drawPositions.setXYZ(count, this.positions[offset], this.positions[offset + 1], this.positions[offset + 2]);
      const fade = this.life[i] / this.lifetime[i];
      // Com mistura aditiva, reduzir a cor até preto faz a partícula desaparecer.
      this.drawColors.setXYZ(count, fade, fade * 0.35, fade * 0.04);
      count++;
    }
    this.geometry.setDrawRange(0, count);
    this.drawPositions.needsUpdate = true;
    this.drawColors.needsUpdate = true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.object.removeFromParent();
    this.sources.clear();
    this.geometry.dispose();
    this.material.dispose();
  }
}
