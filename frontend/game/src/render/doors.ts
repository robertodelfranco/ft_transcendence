import * as THREE from "three";
import type { DoorSnapshot } from "../types";

// Estruturalmente compatível com ViewState.doors; nenhuma dependência de rede.
type DoorView = Readonly<DoorSnapshot>;
const OPEN_DISTANCE = 1.05;
const OPEN_SPEED = 1.5; // unidades por segundo, apenas visual

export class Doors {
  readonly object = new THREE.Group();
  private readonly geometry = new THREE.BoxGeometry(1, 1, 0.12);
  private readonly material: THREE.MeshLambertMaterial;
  private readonly meshes = new Map<string, THREE.Mesh>();

  constructor(grid: readonly string[], doors: readonly DoorView[], texture: THREE.Texture) {
    this.material = new THREE.MeshLambertMaterial({ map: texture });
    for (const door of doors) {
      const mesh = new THREE.Mesh(this.geometry, this.material.clone());
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      // Paredes ao norte/sul: a folha acompanha Z. Oeste/leste: acompanha X.
      if (grid[door.y - 1]?.[door.x] === "1"
          && grid[door.y + 1]?.[door.x] === "1") mesh.rotation.y = Math.PI / 2;
      mesh.position.set(door.x + 0.5, 0.5 + (door.open ? OPEN_DISTANCE : 0), door.y + 0.5);
      mesh.visible = !door.open;
      this.meshes.set(`${door.x},${door.y}`, mesh);
      this.object.add(mesh);
    }
    this.update(doors, 0);
  }

  update(doors: readonly DoorView[], dt: number): void {
    const step = OPEN_SPEED * Math.max(0, Number.isFinite(dt) ? dt : 0);
    for (const door of doors) {
      const mesh = this.meshes.get(`${door.x},${door.y}`);
      if (!mesh) continue;
      const target = 0.5 + (door.open ? OPEN_DISTANCE : 0);
      const distance = target - mesh.position.y;
      mesh.position.y += Math.sign(distance) * Math.min(Math.abs(distance), step);
      mesh.visible = mesh.position.y < 0.5 + OPEN_DISTANCE;
      // Trancada: tom quente; destrancada: textura sem tingimento.
      (mesh.material as THREE.MeshLambertMaterial).color.setHex(door.locked ? 0xffd090 : 0xffffff);
    }
  }

  dispose(): void {
    this.object.removeFromParent();
    for (const mesh of this.meshes.values()) (mesh.material as THREE.Material).dispose();
    this.meshes.clear();
    this.object.clear();
    this.material.dispose();
    this.geometry.dispose();
  }
}
