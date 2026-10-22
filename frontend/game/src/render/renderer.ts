import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import type { Snapshot, PlayerSnapshot } from "../types";
import type { Assets } from "./assets";
import { Doors } from "./doors";
import { HandOverlay } from "./handOverlay";
import { Billboards } from "./billboards";
import { Torches } from "./torches";
import { FireballParticles } from "./fireballParticles";

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
  private composer: EffectComposer | null = null;
  private composerPixelRatio = 1;
  private initialGrid: readonly string[] = [];
  private doorTexture: THREE.Texture | null = null;
  private doors: Doors | null = null;
  private handOverlay: HandOverlay | null = null;
  private billboards: Billboards | null = null;
  private torches: Torches | null = null;
  private fireballParticles: FireballParticles | null = null;
  private resources: Array<{ dispose(): void }> = [];
  private disposed = false;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
  }

  async init(map: GameMap, assets: Assets): Promise<void> {
    if (this.disposed || this.scene) throw new Error("renderer_invalid_lifecycle");
    try {
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 100);

      scene.background = new THREE.Color(assets.ceiling);
      scene.fog = new THREE.FogExp2(assets.ceiling, 0.08);
      scene.add(new THREE.AmbientLight(0xffffff, 0.4));
      const light = new THREE.DirectionalLight(0xffffff, 0.35);
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
      walls.castShadow = true;
      walls.receiveShadow = true;
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
      floor.receiveShadow = true;
      ceiling.receiveShadow = true;
      scene.add(floor, ceiling);

      this.torches = new Torches(grid);
      this.resources.push(this.torches);
      scene.add(this.torches.object);
      this.billboards = new Billboards(assets.billboards);
      this.resources.push(this.billboards);
      scene.add(this.billboards.object);
      this.fireballParticles = new FireballParticles();
      this.resources.push(this.fireballParticles);
      scene.add(this.fireballParticles.object);
      this.initialGrid = grid;
      this.doorTexture = assets.door;
      this.handOverlay = new HandOverlay(assets.hand, assets.fireball);
      this.resources.push(this.handOverlay);
      const composer = new EffectComposer(this.renderer);
      this.resources.push(composer);
      const renderPass = new RenderPass(scene, camera);
      this.resources.push(renderPass);
      composer.addPass(renderPass);
      const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.25, 0.2, 1.1);
      this.resources.push(bloomPass);
      composer.addPass(bloomPass);
      const outputPass = new OutputPass();
      this.resources.push(outputPass);
      composer.addPass(outputPass);
      this.composer = composer;
      this.composerPixelRatio = this.renderer.getPixelRatio();
      camera.rotation.order = "YXZ";
      this.scene = scene;
      this.camera = camera;
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  render(view: ViewState, dt: number): void {
    if (this.disposed || !this.scene || !this.camera || !this.composer) return;
    if (!Number.isFinite(dt) || dt < 0) return;
    // O primeiro ViewState pode trazer Doors já abertas (entrada ou reconexão).
    if (!this.doors && this.doorTexture) {
      this.doors = new Doors(this.initialGrid, view.doors, this.doorTexture);
      this.resources.push(this.doors);
      this.scene.add(this.doors.object);
    }
    const { x, y, dx, dy, pitch } = view.camera;
    this.camera.position.set(x, 0.5, y);
    this.camera.rotation.set(
      THREE.MathUtils.clamp(pitch, -Math.PI / 3, Math.PI / 3),
      Math.atan2(-dx, -dy), 0,
    );
    this.billboards?.update(view, dt);
    this.doors?.update(view.doors, dt);
    this.torches?.update(this.camera.position, dt);
    this.fireballParticles?.update(view.projectiles, dt);
    // Bloom e conversão de cor da cena primeiro; a mão continua nítida por cima.
    this.composer.render(dt);
    this.handOverlay?.render(this.renderer);
  }

  resize(width: number, height: number): void {
    if (this.disposed || !this.camera || width <= 0 || height <= 0) return;
    // Orçamento inicial F3.5: Retina a 2 ficou abaixo da meta nas medições locais.
    const pixelRatio = 1;
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    if (this.composer) {
      if (pixelRatio !== this.composerPixelRatio) {
        this.composer.setPixelRatio(pixelRatio);
        this.composerPixelRatio = pixelRatio;
      }
      this.composer.setSize(width, height);
    }
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.handOverlay?.resize(width, height);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.resources.forEach(resource => resource.dispose());
    this.resources = [];
    this.scene?.clear();
    this.scene = null;
    this.camera = null;
    this.composer = null;
    this.initialGrid = [];
    this.doorTexture = null;
    this.doors = null;
    this.handOverlay = null;
    this.billboards = null;
    this.torches = null;
    this.fireballParticles = null;
    this.renderer.dispose();
  }
}
