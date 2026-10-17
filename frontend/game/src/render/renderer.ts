import * as THREE from "three";
import type { Snapshot, PlayerSnapshot } from "../types";
import type { Assets } from "./assets";

export type GameMap = { grid: string[] };
export type CameraView = Pick<PlayerSnapshot, "x" | "y" | "dx" | "dy"> & { pitch: number };
export interface ViewState {
  localPlayer: PlayerSnapshot;
  otherPlayers: PlayerSnapshot[];
  enemies: Snapshot["enemies"];
  boss: Snapshot["boss"];
  projectiles: Snapshot["projectiles"];
  doors: Snapshot["doors"];
  grid: string[];
  camera: CameraView;
}
export interface Renderer {
  init(map: GameMap, assets: Assets): Promise<void>;
  render(view: ViewState, dt: number): void;
  resize(width: number, height: number): void;
  dispose(): void;
}

export class ThreeRenderer implements Renderer {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private resources: Array<{ dispose(): void }> = [];
  private disposed = false;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  }

  async init(map: GameMap, assets: Assets): Promise<void> {
    if (this.disposed || this.scene) throw new Error("renderer_invalid_lifecycle");
    try {
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 100);

      scene.background = new THREE.Color(assets.ceiling);
      scene.add(new THREE.AmbientLight(0xffffff, 1.2));
      const light = new THREE.DirectionalLight(0xffffff, 1.5);
      light.position.set(2, 4, 1);
      scene.add(light);

      const grid = map.grid;
      const width = grid[0].length;
      const depth = grid.length;
      const wallCount = grid.reduce(
        (total, row) => total + [...row].filter(cell => cell === "1").length,
        0,
      );

      const wallGeometry = new THREE.BoxGeometry(1, 1, 1);
      this.resources.push(wallGeometry);
      const wallMaterial = new THREE.MeshLambertMaterial({ color: 0x777777 });
      this.resources.push(wallMaterial);
      const walls = new THREE.InstancedMesh<
        THREE.BoxGeometry,
        THREE.Material | THREE.Material[]
      >(wallGeometry, wallMaterial, wallCount);
      this.resources.push(walls);
      const texturedMaterials = [assets.walls.ea, assets.walls.we, assets.walls.no, assets.walls.so]
        .map(map => new THREE.MeshLambertMaterial({ map }));
      this.resources.push(...texturedMaterials);
      walls.material = [
        texturedMaterials[1], texturedMaterials[0], wallMaterial, wallMaterial,
        texturedMaterials[3], texturedMaterials[2],
      ];
      const transform = new THREE.Object3D();
      let index = 0;

      grid.forEach((row, y) => {
        [...row].forEach((cell, x) => {
          if (cell !== "1") return;

          // Centro da célula; Grid y vira Z, altura vira Y.
          transform.position.set(x + 0.5, 0.5, y + 0.5);
          transform.updateMatrix();
          walls.setMatrixAt(index++, transform.matrix);
        });
      });
      walls.instanceMatrix.needsUpdate = true;
      scene.add(walls);

      const surfaceGeometry = new THREE.PlaneGeometry(width, depth);
      this.resources.push(surfaceGeometry);
      const floorMaterial = new THREE.MeshLambertMaterial({ color: assets.floor });
      this.resources.push(floorMaterial);
      const ceilingMaterial = new THREE.MeshLambertMaterial({ color: assets.ceiling });
      this.resources.push(ceilingMaterial);
      const floor = new THREE.Mesh(surfaceGeometry, floorMaterial);
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(width / 2, 0, depth / 2);
      const ceiling = new THREE.Mesh(surfaceGeometry, ceilingMaterial);
      ceiling.rotation.x = Math.PI / 2;
      ceiling.position.set(width / 2, 1, depth / 2);
      scene.add(floor, ceiling);

      camera.rotation.order = "YXZ";
      this.scene = scene;
      this.camera = camera;
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  render(view: ViewState, dt: number): void {
    if (this.disposed || !this.scene || !this.camera) return;
    if (!Number.isFinite(dt) || dt < 0) return;
    const { x, y, dx, dy, pitch } = view.camera;
    this.camera.position.set(x, 0.5, y);
    this.camera.rotation.set(
      THREE.MathUtils.clamp(pitch, -Math.PI / 3, Math.PI / 3),
      Math.atan2(-dx, -dy), 0,
    );
    this.renderer.render(this.scene, this.camera);
  }

  resize(width: number, height: number): void {
    if (this.disposed || !this.camera || width <= 0 || height <= 0) return;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.resources.forEach(resource => resource.dispose());
    this.resources = [];
    this.scene?.clear();
    this.scene = null;
    this.camera = null;
    this.renderer.dispose();
  }
}
