import * as THREE from "three";

// Valores iniciais para medição na F3.5, não limites de performance aprovados.
const LIGHT_LIMIT = 4;
const SHADOW_LIMIT = 2;
const LIGHT_RANGE = 5;
const LIGHT_INTENSITY = 2;

export class Torches {
  readonly object = new THREE.Group();
  private readonly positions: THREE.Vector3[] = [];
  private readonly lights: THREE.PointLight[] = [];
  private readonly resources: Array<{ dispose(): void }> = [];
  private elapsed = 0;

  constructor(grid: readonly string[]) {
    grid.forEach((row, y) => {
      [...row].forEach((cell, x) => {
        if (cell === "T") this.positions.push(new THREE.Vector3(x + 0.5, 0.78, y + 0.5));
      });
    });
    if (this.positions.length === 0) return;

    // Meshes próprios, sem PNG novo; o T continua sendo chão na Simulation.
    const stemGeometry = new THREE.CylinderGeometry(0.035, 0.045, 0.5, 6);
    const flameGeometry = new THREE.ConeGeometry(0.08, 0.2, 6);
    const stemMaterial = new THREE.MeshLambertMaterial({ color: 0x58381e });
    const flameMaterial = new THREE.MeshBasicMaterial({ color: 0xffb347 });
    // Cor HDR na chama alimenta o bloom, sem aumentar o alcance da PointLight.
    flameMaterial.color.multiplyScalar(3);
    this.resources.push(stemGeometry, flameGeometry, stemMaterial, flameMaterial);
    const stems = new THREE.InstancedMesh(stemGeometry, stemMaterial, this.positions.length);
    const flames = new THREE.InstancedMesh(flameGeometry, flameMaterial, this.positions.length);
    this.resources.push(stems, flames);
    stems.castShadow = true;
    stems.receiveShadow = true;
    // A chama não projeta sombra sobre a própria fonte luminosa.
    const transform = new THREE.Object3D();
    this.positions.forEach((position, index) => {
      transform.position.set(position.x, 0.4, position.z);
      transform.updateMatrix();
      stems.setMatrixAt(index, transform.matrix);
      transform.position.copy(position);
      transform.updateMatrix();
      flames.setMatrixAt(index, transform.matrix);
    });
    stems.instanceMatrix.needsUpdate = true;
    flames.instanceMatrix.needsUpdate = true;
    this.object.add(stems, flames);

    // Pool fixo: mover fontes existentes evita criar luzes e shaders por quadro.
    const lightCount = Math.min(LIGHT_LIMIT, this.positions.length);
    for (let i = 0; i < lightCount; i++) {
      const light = new THREE.PointLight(0xffaa55, LIGHT_INTENSITY, LIGHT_RANGE);
      light.position.copy(this.positions[i]);
      light.castShadow = i < SHADOW_LIMIT;
      light.shadow.mapSize.set(256, 256);
      light.shadow.camera.near = 0.05;
      light.shadow.camera.far = LIGHT_RANGE;
      light.shadow.bias = -0.001;
      light.shadow.normalBias = 0.02;
      this.lights.push(light);
      this.object.add(light);
    }
  }

  update(camera: THREE.Vector3, dt: number): void {
    this.elapsed += Math.min(Math.max(dt, 0), 0.1);
    // O Grid y virou Z; a altura da câmera não altera a ordem de proximidade.
    const distance = (position: THREE.Vector3) =>
      (position.x - camera.x) ** 2 + (position.z - camera.z) ** 2;
    const nearest = this.positions.map((position, index) => ({ position, index, distance: distance(position) }))
      .sort((a, b) => a.distance - b.distance || a.index - b.index);
    this.lights.forEach((light, slot) => {
      const torch = nearest[slot];
      light.position.copy(torch.position);
      // Oscilação decorativa por tempo em segundos, independente do FPS.
      light.intensity = LIGHT_INTENSITY * (1 + 0.08 * Math.sin(this.elapsed * 7 + torch.index));
    });
  }

  dispose(): void {
    this.object.removeFromParent();
    this.object.clear();
    // PointLight.dispose também libera o render target da sombra.
    this.lights.forEach(light => light.dispose());
    this.lights.length = 0;
    this.resources.forEach(resource => resource.dispose());
    this.resources.length = 0;
    this.positions.length = 0;
  }
}
