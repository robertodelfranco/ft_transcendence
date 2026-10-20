import * as THREE from "three";
import example from "./fixtures/snapshot.example.json";
import { Doors } from "./src/render/doors";
import { HandOverlay } from "./src/render/handOverlay";

// Demo local F3.1/F3.4: alterna fixtures, sem socket ou Simulation.
const canvas = document.querySelector<HTMLCanvasElement>("#game");
if (!canvas) throw new Error("game_canvas_missing");

document.body.style.margin = "0";
document.body.style.overflow = "hidden";
canvas.style.display = "block";
canvas.style.width = "100vw";
canvas.style.height = "100vh";

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 100);

// Theme dungeon: cores e slots de parede de mount-game.md §5.3.
const theme = {
  floor: 0x545454,
  ceiling: 0x161e00,
  walls: {
    no: "/assets/map/dungeon_wall_1.png",
    so: "/assets/map/dungeon_wall_9.png",
    we: "/assets/map/dungeon_wall_2.png",
    ea: "/assets/map/dungeon_wall_10.png",
  },
};
scene.background = new THREE.Color(theme.ceiling);
scene.add(new THREE.AmbientLight(0xffffff, 1.2));
const light = new THREE.DirectionalLight(0xffffff, 1.5);
light.position.set(2, 4, 1);
scene.add(light);

const grid = example.welcome.map.grid;
const width = grid[0].length;
const depth = grid.length;
const wallCount = grid.reduce(
  (total, row) => total + [...row].filter(cell => cell === "1").length,
  0,
);

const wallGeometry = new THREE.BoxGeometry(1, 1, 1);
const wallMaterial = new THREE.MeshLambertMaterial({ color: 0x777777 });
const walls = new THREE.InstancedMesh<
  THREE.BoxGeometry,
  THREE.Material | THREE.Material[]
>(wallGeometry, wallMaterial, wallCount);
const textures: THREE.Texture[] = [];
let doors: Doors | undefined;
let handOverlay: HandOverlay | undefined;
let doorView = example.welcome.snapshot.doors;
const texturedMaterials: THREE.MeshLambertMaterial[] = [];
let disposed = false;
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
const floorMaterial = new THREE.MeshLambertMaterial({ color: theme.floor });
const ceilingMaterial = new THREE.MeshLambertMaterial({ color: theme.ceiling });
const floor = new THREE.Mesh(surfaceGeometry, floorMaterial);
floor.rotation.x = -Math.PI / 2;
floor.position.set(width / 2, 0, depth / 2);
const ceiling = new THREE.Mesh(surfaceGeometry, ceilingMaterial);
ceiling.rotation.x = Math.PI / 2;
ceiling.position.set(width / 2, 1, depth / 2);
scene.add(floor, ceiling);

const player = example.welcome.snapshot.players.find(
  candidate => candidate.id === example.welcome.user_id,
);
if (!player) throw new Error("local_player_missing");

// Altura 0.5 e sensibilidade são escolhas locais desta demonstração.
camera.position.set(player.x, 0.5, player.y);
camera.rotation.order = "YXZ";
let yaw = Math.atan2(-player.dx, -player.dy);
let pitch = 0;
const pitchLimit = Math.PI / 3;
const mouseSensitivity = 0.002;
camera.rotation.set(pitch, yaw, 0);

function look(event: MouseEvent): void {
  if (document.pointerLockElement !== canvas) return;

  // Só a câmera da demo gira; o yaw real será decidido pelo servidor.
  yaw -= event.movementX * mouseSensitivity;
  pitch = THREE.MathUtils.clamp(
    pitch - event.movementY * mouseSensitivity,
    -pitchLimit,
    pitchLimit,
  );
  camera.rotation.set(pitch, yaw, 0);
}

function showPointerLockError(): void {
  showError("pointer_lock_failed");
}

// Catálogo local da página de desenvolvimento: o jogo não importa a casca.
// A integração destes erros com HudState/React pertence à F3.2.
const messages = {
  "pt-BR": {
    asset_load_failed: "Não foi possível carregar os recursos da cena. Recarregue a página.",
    demo_description: "Demo F3.4: alterne as fixtures para observar a porta. Clique na cena para olhar ao redor.",
    closed_door: "Ver porta fechada",
    apply_snapshot: "Aplicar Snapshot",
    pointer_lock_failed: "Não foi possível capturar o mouse. Clique na cena para tentar novamente.",
  },
  en: {
    asset_load_failed: "The scene assets could not be loaded. Reload the page.",
    demo_description: "F3.4 demo: switch fixtures to observe the door. Click the scene to look around.",
    closed_door: "View closed door",
    apply_snapshot: "Apply Snapshot",
    pointer_lock_failed: "The mouse could not be captured. Click the scene to try again.",
  },
  es: {
    asset_load_failed: "No se pudieron cargar los recursos de la escena. Recarga la página.",
    demo_description: "Demo F3.4: alterna los ejemplos para observar la puerta. Haz clic en la escena para mirar alrededor.",
    closed_door: "Ver puerta cerrada",
    apply_snapshot: "Aplicar Snapshot",
    pointer_lock_failed: "No se pudo capturar el ratón. Haz clic en la escena para volver a intentarlo.",
  },
};
const preferredLanguage = navigator.languages.find(language => /^(pt|en|es)\b/i.test(language));
const language = preferredLanguage?.toLowerCase().startsWith("pt") ? "pt-BR"
  : preferredLanguage?.toLowerCase().startsWith("es") ? "es" : "en";
const errorPanel = document.createElement("div");
errorPanel.setAttribute("role", "alert");
errorPanel.lang = language;
errorPanel.style.cssText = "position:fixed;top:16px;left:16px;right:16px;padding:16px;background:#391515;color:white;font:16px sans-serif;z-index:1";
errorPanel.hidden = true;
document.body.append(errorPanel);

function showError(code: keyof typeof messages.en): void {
  errorPanel.dataset.code = code;
  errorPanel.textContent = messages[language][code];
  errorPanel.hidden = false;
}

// Os botões só trocam dados de demonstração; não executam Action local.
const controls = document.createElement("div");
controls.lang = language;
controls.style.cssText = "position:fixed;bottom:16px;left:16px;max-width:65vw;padding:12px;background:#161e00dd;color:white;font:14px sans-serif";
const description = document.createElement("p");
description.textContent = messages[language].demo_description;
controls.append(description);
const closedButton = document.createElement("button");
closedButton.textContent = messages[language].closed_door;
const snapshotButton = document.createElement("button");
snapshotButton.textContent = messages[language].apply_snapshot;
closedButton.disabled = snapshotButton.disabled = true;
controls.append(closedButton, snapshotButton);
document.body.append(controls);

function showClosedDoor(): void {
  doorView = example.welcome.snapshot.doors;
  // Recria para retornar instantaneamente ao estado inicial da fixture.
  if (doors) {
    doors.dispose();
    doors = new Doors(grid, doorView, textures[4]);
    scene.add(doors.object);
  }
  // Escolhe uma Door que realmente abre no segundo Snapshot.
  const door = example.snapshot.doors.find(candidate => candidate.open)!;
  const alongZ = grid[door.y - 1]?.[door.x] === "1"
    && grid[door.y + 1]?.[door.x] === "1";
  camera.position.set(door.x + 0.5 + (alongZ ? 1.5 : 0), 0.5,
    door.y + 0.5 + (alongZ ? 0 : 1.5));
  yaw = alongZ ? Math.PI / 2 : 0;
  pitch = 0;
  camera.rotation.set(pitch, yaw, 0);
}

function applySnapshot(): void {
  doorView = example.snapshot.doors;
}

closedButton.addEventListener("click", showClosedDoor);
snapshotButton.addEventListener("click", applySnapshot);

async function loadAssets(): Promise<void> {
  const loader = new THREE.TextureLoader();
  const results = await Promise.allSettled(
    [theme.walls.ea, theme.walls.we, theme.walls.no, theme.walls.so,
      "/assets/map/door_2.png", "/assets/player/player_hand_white.png",
      "/assets/player/fireball_1.png"]
      .map(url => loader.loadAsync(url)),
  );

  // Libera inclusive cargas parciais se a página sair durante o carregamento.
  if (disposed || results.some(result => result.status === "rejected")) {
    results.forEach(result => {
      if (result.status === "fulfilled") result.value.dispose();
    });
    if (!disposed) {
      renderer.setAnimationLoop(null);
      showError("asset_load_failed");
    }
    return;
  }

  results.forEach(result => {
    if (result.status !== "fulfilled") return;
    const texture = result.value;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    textures.push(texture);
  });

  textures.slice(0, 4).forEach(texture => {
    texturedMaterials.push(new THREE.MeshLambertMaterial({ map: texture }));
  });
  doors = new Doors(grid, doorView, textures[4]);
  scene.add(doors.object);
  handOverlay = new HandOverlay(textures[5], textures[6]);
  handOverlay.resize(window.innerWidth, window.innerHeight);
  closedButton.disabled = snapshotButton.disabled = false;

  // BoxGeometry: +X, -X, +Y, -Y, +Z, -Z.
  // Slots legados do Cub3D: WE, EA, tampas, SO, NO.
  walls.material = [
    texturedMaterials[1], texturedMaterials[0], wallMaterial, wallMaterial,
    texturedMaterials[3], texturedMaterials[2],
  ];
}

async function lockPointer(): Promise<void> {
  if (document.pointerLockElement === canvas) return;
  try {
    await canvas!.requestPointerLock();
  } catch {
    showPointerLockError();
  }
}

function updatePointerLock(): void {
  if (document.pointerLockElement === canvas
      && errorPanel.dataset.code === "pointer_lock_failed") {
    errorPanel.hidden = true;
  }
}

function resize(): void {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  handOverlay?.resize(window.innerWidth, window.innerHeight);
}

function dispose(): void {
  if (disposed) return;
  disposed = true;
  renderer.setAnimationLoop(null);
  canvas!.removeEventListener("click", lockPointer);
  document.removeEventListener("mousemove", look);
  document.removeEventListener("pointerlockerror", showPointerLockError);
  document.removeEventListener("pointerlockchange", updatePointerLock);
  window.removeEventListener("resize", resize);
  window.removeEventListener("pagehide", dispose);
  if (document.pointerLockElement === canvas) document.exitPointerLock();
  closedButton.removeEventListener("click", showClosedDoor);
  snapshotButton.removeEventListener("click", applySnapshot);
  controls.remove();
  doors?.dispose();
  handOverlay?.dispose();
  walls.dispose();
  wallGeometry.dispose();
  wallMaterial.dispose();
  texturedMaterials.forEach(material => material.dispose());
  textures.forEach(texture => texture.dispose());
  surfaceGeometry.dispose();
  floorMaterial.dispose();
  ceilingMaterial.dispose();
  renderer.dispose();
  errorPanel.remove();
}

canvas.addEventListener("click", lockPointer);
document.addEventListener("mousemove", look);
document.addEventListener("pointerlockerror", showPointerLockError);
document.addEventListener("pointerlockchange", updatePointerLock);
window.addEventListener("resize", resize);
window.addEventListener("pagehide", dispose);
resize();
let previousTime: number | undefined;
renderer.setAnimationLoop((time: number) => {
  const dt = previousTime === undefined ? 0 : (time - previousTime) / 1000;
  previousTime = time;
  doors?.update(doorView, dt);
  renderer.render(scene, camera);
  handOverlay?.render(renderer);
});
void loadAssets();

if (import.meta.hot) import.meta.hot.dispose(dispose);
