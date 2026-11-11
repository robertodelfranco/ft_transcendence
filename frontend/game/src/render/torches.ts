import * as THREE from "three";
import { dungeonTheme, type Theme } from "./themes";

// Valores iniciais para medição na F3.5, não limites de performance aprovados.
const LIGHT_LIMIT = 4;
const SHADOW_LIMIT = 2;
const LIGHT_RANGE = 5;
const LIGHT_INTENSITY = 2;

type WallMount = { position: THREE.Vector3; normal: THREE.Vector3 };

// Busca uma face de parede pelo corredor, sem atravessar Doors nem sair do Grid.
function wallMount(grid: readonly string[], x: number, y: number): WallMount | null {
  let closest: WallMount | null = null;
  let closestDistance = Infinity;
  for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
    for (let distance = 1; distance < closestDistance; distance++) {
      const cell = grid[y + dy * distance]?.[x + dx * distance];
      if (cell === undefined || cell === " " || cell === "D" || cell === "O") break;
      if (cell !== "1") continue;
      const normal = new THREE.Vector3(-dx, 0, -dy);
      const position = new THREE.Vector3(x + dx * distance + 0.5, 0.78, y + dy * distance + 0.5)
        .addScaledVector(normal, 0.5 + 0.14);
      closest = { position, normal };
      closestDistance = distance;
      break;
    }
  }
  return closest;
}

export class Torches {
  readonly object = new THREE.Group();
  private readonly positions: THREE.Vector3[] = [];
  private readonly lights: THREE.PointLight[] = [];
  private readonly resources: Array<{ dispose(): void }> = [];
  private elapsed = 0;

  constructor(grid: readonly string[], lightColors: Theme["light"] = dungeonTheme.light) {
    const mounts: WallMount[] = [];
    grid.forEach((row, y) => {
      [...row].forEach((cell, x) => {
        if (cell !== "T") return;
        const mount = wallMount(grid, x, y);
        // Sem parede acessível, não desenha um poste flutuante.
        if (mount) mounts.push(mount);
      });
    });
    this.positions.push(...mounts.map(mount => mount.position));
    if (this.positions.length === 0) return;

    // Meshes próprios, sem PNG novo; o T continua sendo chão na Simulation.
    const stemGeometry = new THREE.CylinderGeometry(0.025, 0.035, 0.28, 6);
    const bracketGeometry = new THREE.BoxGeometry(0.035, 0.035, 0.14);
    const flameGeometry = new THREE.ConeGeometry(0.08, 0.2, 6);
    const stemMaterial = new THREE.MeshLambertMaterial({ color: 0x58381e });
    const flameMaterial = new THREE.MeshBasicMaterial({ color: lightColors.flame });
    // Cor HDR na chama alimenta o bloom, sem aumentar o alcance da PointLight.
    flameMaterial.color.multiplyScalar(1.5);
    this.resources.push(stemGeometry, bracketGeometry, flameGeometry, stemMaterial, flameMaterial);
    const stems = new THREE.InstancedMesh(stemGeometry, stemMaterial, this.positions.length);
    const brackets = new THREE.InstancedMesh(bracketGeometry, stemMaterial, this.positions.length);
    const flames = new THREE.InstancedMesh(flameGeometry, flameMaterial, this.positions.length);
    this.resources.push(stems, brackets, flames);
    stems.castShadow = false;
    stems.receiveShadow = true;
    brackets.receiveShadow = true;
    // A chama não projeta sombra sobre a própria fonte luminosa.
    const transform = new THREE.Object3D();
    this.positions.forEach((position, index) => {
      transform.rotation.set(0, 0, 0);
      transform.position.set(position.x, 0.54, position.z);
      transform.updateMatrix();
      stems.setMatrixAt(index, transform.matrix);
      transform.position.copy(position);
      transform.updateMatrix();
      flames.setMatrixAt(index, transform.matrix);
      const normal = mounts[index].normal;
      transform.position.copy(position).addScaledVector(normal, -0.07);
      transform.position.y = 0.44;
      transform.rotation.y = normal.x === 0 ? 0 : Math.PI / 2;
      transform.updateMatrix();
      brackets.setMatrixAt(index, transform.matrix);
    });
    stems.instanceMatrix.needsUpdate = true;
    flames.instanceMatrix.needsUpdate = true;
    brackets.instanceMatrix.needsUpdate = true;
    this.object.add(stems, brackets, flames);

    // Pool fixo: mover fontes existentes evita criar luzes e shaders por quadro.
    const lightCount = Math.min(LIGHT_LIMIT, this.positions.length);
    for (let i = 0; i < lightCount; i++) {
      const light = new THREE.PointLight(lightColors.torch, LIGHT_INTENSITY, LIGHT_RANGE);
      light.position.copy(this.positions[i]);
      light.castShadow = i < SHADOW_LIMIT;
      light.shadow.mapSize.set(512, 512);
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
