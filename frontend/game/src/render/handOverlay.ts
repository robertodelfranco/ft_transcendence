import * as THREE from "three";
import { FIREBALL_CHARGE_S } from "../rules";

// Margem sobre o limiar do servidor: 1–2 Ticks de jitter não transformam "pronto" em tiro normal.
const READY_MARGIN_S = 0.1;

// Fração transparente abaixo do último pixel visível; mede uma vez, não no resize.
function bottomPadding(image: HTMLImageElement): number {
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  if (width <= 0 || height <= 0) throw new Error("hand_asset_invalid");
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("hand_canvas_unavailable");
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, width, height).data;
  for (let y = height - 1; y >= 0; y--) {
    for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3] > 0) return (height - y - 1) / height;
    }
  }
  throw new Error("hand_asset_empty");
}

// Passagem ortográfica após a cena: tamanho estável, sem colisão com paredes.
export class HandOverlay {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 0.5, -0.5, 0.1, 10);
  private readonly geometry = new THREE.PlaneGeometry(1, 1);
  private readonly materials: THREE.MeshBasicMaterial[] = [];
  private readonly hand: THREE.Mesh;
  private readonly frames: Array<{ material: THREE.MeshBasicMaterial; aspect: number; padding: number }>;
  private readonly glow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private aspect = 1;
  private activeFrame = 0;
  // `matches` é vivo: lido a cada quadro, dispensa listener.
  private readonly preference = typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;

  constructor(handTexture: THREE.Texture, chargeTexture: THREE.Texture = handTexture) {
    this.camera.position.z = 1;
    const createMesh = (texture: THREE.Texture): THREE.Mesh => {
      const material = new THREE.MeshBasicMaterial({
        map: texture, transparent: true, depthTest: false, depthWrite: false,
        // A cena usa tone mapping no OutputPass; manter a cor original do overlay.
        toneMapped: false,
      });
      this.materials.push(material);
      const mesh = new THREE.Mesh(this.geometry, material);
      this.scene.add(mesh);
      return mesh;
    };
    this.hand = createMesh(handTexture);
    this.hand.renderOrder = 2;
    this.frames = [handTexture, chargeTexture].map((texture, index) => {
      const image = texture.image as HTMLImageElement;
      const material = index === 0 ? this.materials[0] : new THREE.MeshBasicMaterial({
        map: texture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
      });
      if (index !== 0) this.materials.push(material);
      return { material, aspect: image.naturalWidth / image.naturalHeight, padding: bottomPadding(image) };
    });
    const glowMaterial = new THREE.MeshBasicMaterial({
      map: handTexture, color: 0xffcc77, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, toneMapped: false,
    });
    this.materials.push(glowMaterial);
    this.glow = new THREE.Mesh(this.geometry, glowMaterial);
    this.glow.renderOrder = 3;
    this.scene.add(this.glow);
    this.layout();
  }

  resize(width: number, height: number): void {
    const aspect = Math.max(1, width) / Math.max(1, height);
    this.aspect = aspect;
    this.camera.left = -aspect / 2;
    this.camera.right = aspect / 2;
    this.camera.updateProjectionMatrix();
    this.layout();
  }

  updateCharge(seconds: number | null): void {
    const elapsed = Math.max(0, seconds ?? 0);
    const ready = elapsed >= FIREBALL_CHARGE_S + READY_MARGIN_S;
    const still = this.preference?.matches ?? false; // reduced-motion: sem alternância nem pulso
    const phase = 2 * elapsed + 0.7 * elapsed * elapsed;
    this.activeFrame = seconds === null ? 0 : ready ? 1 : still ? 0 : Math.floor(phase) % 2;
    const progress = Math.min(1, elapsed / FIREBALL_CHARGE_S);
    const pulse = still ? 1 : 0.8 + 0.2 * Math.sin(phase * Math.PI * 2);
    this.glow.material.opacity = seconds === null ? 0 : ready ? 0.32
      : (0.08 + progress * 0.24) * pulse;
    this.layout();
  }

  private layout(): void {
    const { material, aspect: imageAspect, padding } = this.frames[this.activeFrame];
    this.hand.material = material;
    this.hand.scale.set(0.34 * imageAspect, 0.34, 1);
    const aspect = this.aspect;
    // Limita o deslocamento em telas estreitas para manter a mão visível.
    const x = Math.max(0, Math.min(aspect * 0.12, aspect / 2 - this.hand.scale.x / 2));
    // Encosta a base visível na borda, compensando o espaço transparente do PNG.
    const handY = this.camera.bottom + this.hand.scale.y * (0.5 - padding);
    this.hand.position.set(x, handY, 0);
    this.glow.material.map = material.map;
    this.glow.position.copy(this.hand.position);
    this.glow.scale.copy(this.hand.scale);
  }

  render(renderer: THREE.WebGLRenderer): void {
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    try {
      renderer.clearDepth();
      renderer.render(this.scene, this.camera);
    } finally {
      renderer.autoClear = autoClear;
    }
  }

  dispose(): void {
    this.scene.clear();
    this.geometry.dispose();
    this.materials.forEach(material => material.dispose());
  }
}
