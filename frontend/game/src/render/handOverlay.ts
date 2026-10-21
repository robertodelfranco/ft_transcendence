import * as THREE from "three";

// Passagem ortográfica após a cena: tamanho estável, sem colisão com paredes.
export class HandOverlay {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 0.5, -0.5, 0.1, 10);
  private readonly geometry = new THREE.PlaneGeometry(1, 1);
  private readonly materials: THREE.MeshBasicMaterial[] = [];
  private readonly hand: THREE.Mesh;
  private readonly fireball: THREE.Mesh;

  constructor(handTexture: THREE.Texture, fireballTexture: THREE.Texture) {
    this.camera.position.z = 1;
    const createMesh = (texture: THREE.Texture): THREE.Mesh => {
      const material = new THREE.MeshBasicMaterial({
        map: texture, transparent: true, depthTest: false, depthWrite: false,
      });
      this.materials.push(material);
      const mesh = new THREE.Mesh(this.geometry, material);
      this.scene.add(mesh);
      return mesh;
    };
    this.hand = createMesh(handTexture);
    this.fireball = createMesh(fireballTexture);
    const image = handTexture.image as { width: number; height: number };
    this.hand.scale.set(0.34 * image.width / image.height, 0.34, 1);
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
    this.hand.position.set(x, -0.34, 0);
    this.fireball.position.set(x - 0.015, -0.18, 0);
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
