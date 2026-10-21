import { AssetLoader } from "./src/render/assets";
import type { Assets } from "./src/render/assets";
import { ThreeRenderer, type ViewState } from "./src/render/renderer";
import { galleryCamera, galleryView, type GalleryKind } from "./fixtures/billboards";
import { applyGridDelta, buildViewState } from "./src/net/viewstate";
import type { Snapshot, WelcomeMessage } from "./src/types";
import example from "./fixtures/snapshot.example.json";

// Demo local F3.3/F3.4: usa o Snapshot da Simulation e uma galeria visual, sem socket.
const canvas = document.querySelector<HTMLCanvasElement>("#game");
if (!canvas) throw new Error("game_canvas_missing");

document.body.style.margin = "0";
document.body.style.overflow = "hidden";
canvas.style.display = "block";
canvas.style.width = "100vw";
canvas.style.height = "100vh";

const welcome = example.welcome as WelcomeMessage;
const snapshot = example.snapshot as Snapshot;
const grid = applyGridDelta(welcome.map.grid, snapshot.grid_delta);
const initialView = buildViewState(
  snapshot,
  grid,
  welcome.user_id,
  welcome.room.mode,
);
if (!initialView) throw new Error("local_player_missing");
const baseView = initialView;
let view: ViewState = { ...baseView, camera: { ...baseView.camera } };
let galleryKind: GalleryKind | undefined;
let galleryElapsed = 0;
const player = view.localPlayer;
let renderer: ThreeRenderer | undefined;
let assets: Assets | undefined;
let disposed = false;
let frame = 0;
let yaw = Math.atan2(-player.dx, -player.dy);
let pitch = 0;
const pitchLimit = Math.PI / 3;
const mouseSensitivity = 0.002;
function look(event: MouseEvent): void {
  if (document.pointerLockElement !== canvas) return;

  // Só a câmera da demo gira; o yaw real será decidido pelo servidor.
  yaw -= event.movementX * mouseSensitivity;
  pitch = Math.max(-pitchLimit, Math.min(
    pitch - event.movementY * mouseSensitivity,
    pitchLimit,
  ));
  view.camera.dx = -Math.sin(yaw);
  view.camera.dy = -Math.cos(yaw);
  view.camera.pitch = pitch;
}

function showPointerLockError(): void {
  showError("pointer_lock_failed");
}

// Catálogo local da página de desenvolvimento: o jogo não importa a casca.
// A casca recebe os mesmos códigos para apresentar o estado de erro.
const messages = {
  "pt-BR": {
    gallery_label: "Galeria de entidades",
    original_snapshot: "Snapshot original",
    enemy: "Enemy",
    boss: "Boss",
    pickups: "Pickups",
    projectiles: "Fireball e bullet",
    players: "Outros Players",
    asset_load_failed: "Não foi possível carregar os recursos da cena. Recarregue a página.",
    demo_description: "Demo F3.3/F3.4: selecione uma entidade para observar os clipes. Clique na cena para olhar ao redor.",
    closed_door: "Ver porta fechada",
    apply_snapshot: "Aplicar Snapshot",
    renderer_init_failed: "Não foi possível iniciar o renderizador.",
    pointer_lock_failed: "Não foi possível capturar o mouse. Clique na cena para tentar novamente.",
  },
  en: {
    gallery_label: "Entity gallery",
    original_snapshot: "Original Snapshot",
    enemy: "Enemy",
    boss: "Boss",
    pickups: "Pickups",
    projectiles: "Fireball and bullet",
    players: "Other Players",
    asset_load_failed: "The scene assets could not be loaded. Reload the page.",
    demo_description: "F3.3/F3.4 demo: select an entity to observe its clips. Click the scene to look around.",
    closed_door: "View closed door",
    apply_snapshot: "Apply Snapshot",
    renderer_init_failed: "Renderer initialization failed.",
    pointer_lock_failed: "The mouse could not be captured. Click the scene to try again.",
  },
  es: {
    gallery_label: "Galería de entidades",
    original_snapshot: "Snapshot original",
    enemy: "Enemy",
    boss: "Boss",
    pickups: "Pickups",
    projectiles: "Fireball y bullet",
    players: "Otros Players",
    asset_load_failed: "No se pudieron cargar los recursos de la escena. Recarga la página.",
    demo_description: "Demo F3.3/F3.4: selecciona una entidad para observar los clips. Haz clic en la escena para mirar alrededor.",
    closed_door: "Ver puerta cerrada",
    apply_snapshot: "Aplicar Snapshot",
    renderer_init_failed: "No se pudo iniciar el renderizador.",
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
  errorPanel.dataset.status = "error";
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
const galleryLabel = document.createElement("label");
galleryLabel.textContent = messages[language].gallery_label;
const gallerySelect = document.createElement("select");
const galleryOptions = ["original_snapshot", "enemy", "boss", "pickups", "projectiles", "players"] as const;
galleryOptions.forEach(value => {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = messages[language][value];
  gallerySelect.append(option);
});
gallerySelect.disabled = true;
galleryLabel.append(gallerySelect);
controls.append(galleryLabel);
document.body.append(controls);

function selectGallery(): void {
  galleryElapsed = 0;
  const selected = gallerySelect.value;
  if (selected === "original_snapshot") {
    galleryKind = undefined;
    view = { ...baseView, camera: { ...baseView.camera } };
    yaw = Math.atan2(-view.camera.dx, -view.camera.dy);
  } else {
    galleryKind = selected as GalleryKind;
    view.camera = { x: galleryCamera.x, y: galleryCamera.y, dx: 0, dy: -1, pitch: 0 };
    yaw = 0;
  }
  pitch = 0;
  view.camera.pitch = pitch;
}
gallerySelect.addEventListener("change", selectGallery);

async function initRenderer(): Promise<void> {
  if (!assets || disposed) return;
  renderer?.dispose();
  renderer = undefined;
  renderer = new ThreeRenderer(canvas!);
  await renderer.init(welcome.map, assets);
  if (!disposed) resize();
}

function showInitError(error: unknown): void {
  cancelAnimationFrame(frame);
  renderer?.dispose();
  assets?.dispose();
  closedButton.disabled = snapshotButton.disabled = gallerySelect.disabled = true;
  if (!disposed) showError(error instanceof Error && error.message === "asset_load_failed"
    ? "asset_load_failed" : "renderer_init_failed");
}

async function showClosedDoor(): Promise<void> {
  if (!assets || disposed) return;
  galleryKind = undefined;
  gallerySelect.value = "original_snapshot";
  closedButton.disabled = snapshotButton.disabled = gallerySelect.disabled = true;
  try {
    const closed = buildViewState(
      welcome.snapshot,
      applyGridDelta(welcome.map.grid, welcome.snapshot.grid_delta),
      welcome.user_id,
      welcome.room.mode,
    );
    if (!closed) throw new Error("local_player_missing");
    view = closed;
    const door = snapshot.doors.find(candidate => candidate.open);
    if (door) {
      const alongZ = welcome.map.grid[door.y - 1]?.[door.x] === "1"
        && welcome.map.grid[door.y + 1]?.[door.x] === "1";
      yaw = alongZ ? Math.PI / 2 : 0;
      pitch = 0;
      view.camera = {
        x: door.x + 0.5 + (alongZ ? 1.5 : 0),
        y: door.y + 0.5 + (alongZ ? 0 : 1.5),
        dx: -Math.sin(yaw), dy: -Math.cos(yaw), pitch,
      };
    }
    // Recria só o Renderer com os assets já carregados: a Door volta fechada imediatamente.
    await initRenderer();
    if (!disposed) closedButton.disabled = snapshotButton.disabled = gallerySelect.disabled = false;
  } catch (error) {
    showInitError(error);
  }
}

function applySnapshot(): void {
  galleryKind = undefined;
  gallerySelect.value = "original_snapshot";
  const next = buildViewState(
    snapshot,
    applyGridDelta(welcome.map.grid, snapshot.grid_delta),
    welcome.user_id,
    welcome.room.mode,
  );
  if (next) view = { ...next, camera: view.camera };
}

closedButton.addEventListener("click", showClosedDoor);
snapshotButton.addEventListener("click", applySnapshot);

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
  renderer?.resize(window.innerWidth, window.innerHeight);
}

function dispose(): void {
  if (disposed) return;
  disposed = true;
  cancelAnimationFrame(frame);
  canvas!.removeEventListener("click", lockPointer);
  document.removeEventListener("mousemove", look);
  document.removeEventListener("pointerlockerror", showPointerLockError);
  document.removeEventListener("pointerlockchange", updatePointerLock);
  window.removeEventListener("resize", resize);
  window.removeEventListener("pagehide", dispose);
  if (document.pointerLockElement === canvas) document.exitPointerLock();
  closedButton.removeEventListener("click", showClosedDoor);
  snapshotButton.removeEventListener("click", applySnapshot);
  gallerySelect.removeEventListener("change", selectGallery);
  controls.remove();
  renderer?.dispose();
  assets?.dispose();
  errorPanel.remove();
}

async function start(): Promise<void> {
  try {
    assets = await new AssetLoader().load();
    if (disposed) {
      assets.dispose();
      return;
    }
    await initRenderer();
    if (disposed) return;
    closedButton.disabled = snapshotButton.disabled = gallerySelect.disabled = false;
    let previous = performance.now();
    function draw(now: number): void {
      if (disposed) return;
      const dt = (now - previous) / 1000;
      let renderedView = view;
      if (galleryKind) {
        galleryElapsed += dt;
        // Somente a demo fabrica os estados; o Renderer recebe um ViewState completo.
        const gallery = galleryView(baseView, galleryKind, galleryElapsed);
        renderedView = {
          ...view,
          otherPlayers: [...gallery.otherPlayers],
          enemies: [...gallery.enemies],
          boss: gallery.boss,
          projectiles: [...gallery.projectiles],
          grid: [...gallery.grid],
        };
      }
      renderer!.render(renderedView, dt);
      previous = now;
      frame = requestAnimationFrame(draw);
    }
    frame = requestAnimationFrame(draw);
  } catch (error) {
    showInitError(error);
  }
}

canvas.addEventListener("click", lockPointer);
document.addEventListener("mousemove", look);
document.addEventListener("pointerlockerror", showPointerLockError);
document.addEventListener("pointerlockchange", updatePointerLock);
window.addEventListener("resize", resize);
window.addEventListener("pagehide", dispose);
void start();
if (import.meta.hot) import.meta.hot.dispose(dispose);
