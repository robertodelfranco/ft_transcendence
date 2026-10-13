import * as THREE from "three";
import example from "../../docs/contracts/snapshot.example.json";

// Demo local da F3.1: usa o welcome fabricado, sem socket ou Simulation.
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
const walls = new THREE.InstancedMesh(wallGeometry, wallMaterial, wallCount);
const wallTextures: THREE.Texture[] = [];
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
    asset_load_failed: "Não foi possível carregar as texturas das paredes. Recarregue a página.",
    pointer_lock_failed: "Não foi possível capturar o mouse. Clique na cena para tentar novamente.",
  },
  en: {
    asset_load_failed: "The wall textures could not be loaded. Reload the page.",
    pointer_lock_failed: "The mouse could not be captured. Click the scene to try again.",
  },
  es: {
    asset_load_failed: "No se pudieron cargar las texturas de las paredes. Recarga la página.",
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

async function loadWallTextures(): Promise<void> {
  const loader = new THREE.TextureLoader();
  const results = await Promise.allSettled(
    [theme.walls.ea, theme.walls.we, theme.walls.no, theme.walls.so]
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
    wallTextures.push(texture);
    texturedMaterials.push(new THREE.MeshLambertMaterial({ map: texture }));
  });

  // BoxGeometry: +X, -X, +Y, -Y, +Z, -Z.
  // Slots legados do Cub3D: EA, WE, tampas, NO, SO.
  walls.material = [
    texturedMaterials[0], texturedMaterials[1], wallMaterial, wallMaterial,
    texturedMaterials[2], texturedMaterials[3],
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
  walls.dispose();
  wallGeometry.dispose();
  wallMaterial.dispose();
  texturedMaterials.forEach(material => material.dispose());
  wallTextures.forEach(texture => texture.dispose());
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
renderer.setAnimationLoop(() => renderer.render(scene, camera));
void loadWallTextures();

if (import.meta.hot) import.meta.hot.dispose(dispose);
