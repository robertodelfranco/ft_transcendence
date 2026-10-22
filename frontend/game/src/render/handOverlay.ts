import * as THREE from "three";

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
  private readonly fireball: THREE.Mesh;
  private readonly handBottomPadding: number;

  constructor(handTexture: THREE.Texture, fireballTexture: THREE.Texture) {
    const image = handTexture.image as HTMLImageElement;
    this.handBottomPadding = bottomPadding(image);
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
    this.fireball = createMesh(fireballTexture);
    this.hand.scale.set(0.34 * image.naturalWidth / image.naturalHeight, 0.34, 1);
    const fireImage = fireballTexture.image as { width: number; height: number };
    this.fireball.scale.set(0.17 * fireImage.width / fireImage.height, 0.17, 1);
    this.fireball.renderOrder = 1;
  }

  resize(width: number, height: number): void {
    const aspect = Math.max(1, width) / Math.max(1, height);
    this.camera.left = -aspect / 2;
    this.camera.right = aspect / 2;
    this.camera.updateProjectionMatrix();
    // Limita o deslocamento em telas estreitas para manter a mão visível.
    const x = Math.max(0, Math.min(aspect * 0.22, aspect / 2 - this.hand.scale.x / 2));
    // Encosta a base visível na borda, compensando o espaço transparente do PNG.
    const handY = this.camera.bottom + this.hand.scale.y * (0.5 - this.handBottomPadding);
    this.hand.position.set(x, handY, 0);
    this.fireball.position.set(x - 0.015, handY + 0.16, 0);
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
