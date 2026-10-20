import { AssetLoader } from "./src/render/assets";
import type { Assets } from "./src/render/assets";
import { ThreeRenderer } from "./src/render/renderer";
import { applyGridDelta, buildViewState } from "./src/net/viewstate";
import type { Snapshot, WelcomeMessage } from "./src/types";
import example from "./fixtures/snapshot.example.json";

// Demo local: lê welcome e Snapshot da fixture, sem socket.
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
const view = initialView;
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
    asset_load_failed: "Não foi possível carregar as texturas das paredes. Recarregue a página.",
    renderer_init_failed: "Não foi possível iniciar o renderizador.",
    pointer_lock_failed: "Não foi possível capturar o mouse. Clique na cena para tentar novamente.",
  },
  en: {
    asset_load_failed: "The wall textures could not be loaded. Reload the page.",
    renderer_init_failed: "Renderer initialization failed.",
    pointer_lock_failed: "The mouse could not be captured. Click the scene to try again.",
  },
  es: {
    asset_load_failed: "No se pudieron cargar las texturas de las paredes. Recarga la página.",
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
    renderer = new ThreeRenderer(canvas!);
    await renderer.init(welcome.map, assets);
    if (disposed) return;
    resize();
    let previous = performance.now();
    function draw(now: number): void {
      if (disposed) return;
      renderer!.render(view, (now - previous) / 1000);
      previous = now;
      frame = requestAnimationFrame(draw);
    }
    frame = requestAnimationFrame(draw);
  } catch (error) {
    renderer?.dispose();
    assets?.dispose();
    if (!disposed) showError(error instanceof Error && error.message === "asset_load_failed"
      ? "asset_load_failed" : "renderer_init_failed");
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
