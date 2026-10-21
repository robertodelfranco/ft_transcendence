import { AssetLoader } from "./src/render/assets";
import type { Assets } from "./src/render/assets";
import { ThreeRenderer } from "./src/render/renderer";
import { applyGridDelta, buildViewState } from "./src/net/viewstate";
import type { Snapshot, WelcomeMessage } from "./src/types";
import example from "./fixtures/snapshot.example.json";

// Demo local F3.4: usa o Snapshot da Simulation e alterna fixtures, sem socket.
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
let view = initialView;
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
    asset_load_failed: "Não foi possível carregar os recursos da cena. Recarregue a página.",
    demo_description: "Demo F3.4: alterne as fixtures para observar a porta. Clique na cena para olhar ao redor.",
    closed_door: "Ver porta fechada",
    apply_snapshot: "Aplicar Snapshot",
    renderer_init_failed: "Não foi possível iniciar o renderizador.",
    pointer_lock_failed: "Não foi possível capturar o mouse. Clique na cena para tentar novamente.",
  },
  en: {
    asset_load_failed: "The scene assets could not be loaded. Reload the page.",
    demo_description: "F3.4 demo: switch fixtures to observe the door. Click the scene to look around.",
    closed_door: "View closed door",
    apply_snapshot: "Apply Snapshot",
    renderer_init_failed: "Renderer initialization failed.",
    pointer_lock_failed: "The mouse could not be captured. Click the scene to try again.",
  },
  es: {
    asset_load_failed: "No se pudieron cargar los recursos de la escena. Recarga la página.",
    demo_description: "Demo F3.4: alterna los ejemplos para observar la puerta. Haz clic en la escena para mirar alrededor.",
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
document.body.append(controls);

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
  closedButton.disabled = snapshotButton.disabled = true;
  if (!disposed) showError(error instanceof Error && error.message === "asset_load_failed"
    ? "asset_load_failed" : "renderer_init_failed");
}

async function showClosedDoor(): Promise<void> {
  if (!assets || disposed) return;
  closedButton.disabled = snapshotButton.disabled = true;
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
    if (!disposed) closedButton.disabled = snapshotButton.disabled = false;
  } catch (error) {
    showInitError(error);
  }
}

function applySnapshot(): void {
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
    closedButton.disabled = snapshotButton.disabled = false;
    let previous = performance.now();
    function draw(now: number): void {
      if (disposed) return;
      renderer!.render(view, (now - previous) / 1000);
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
