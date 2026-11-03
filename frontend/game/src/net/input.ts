// Teclado e mouse viram Keys, mouse_dx e Action (ws-messages.md §2.2). Só lê o estado;
// quem decide quando mandar é o laço de passo fixo da Prediction.
import type { ActionKind, Keys } from "../types";

// rad por pixel de movementX; proposta a ajustar com o Roberto jogando
export const MOUSE_SENSITIVITY = 0.0025;

// KeyboardEvent.code é a posição da tecla, não a letra: WASD funciona igual num teclado AZERTY
const MOVE_KEYS: Record<string, keyof Keys> = {
  KeyW: "up", KeyS: "down", KeyA: "left", KeyD: "right",
  ArrowLeft: "rot_left", ArrowRight: "rot_right",
  ShiftLeft: "sprint", ShiftRight: "sprint",
};
const ACTION_KEYS: Record<string, ActionKind> = { Space: "fire", KeyF: "door" };

export interface InputCapture {
  readonly keys: Keys;
  takeMouseDx(): number; // giro acumulado desde a última chamada, em rad
  dispose(): void;
}

const released = (): Keys => ({ up: false, down: false, left: false, right: false,
  rot_left: false, rot_right: false, sprint: false });

// quem usa um controle da casca (campo, botão, link) não anda nem atira, e a tecla faz o que
// faria: o Espaço escreve espaço no campo e aperta o botão em foco
function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable
    || target.closest("button, a, input, textarea, select, summary") !== null);
}

export function captureInput(canvas: HTMLCanvasElement, onAction: (kind: ActionKind) => void,
  sensitivity = MOUSE_SENSITIVITY): InputCapture {
  const keys = released();
  let mouseDx = 0;

  function onKeyDown(event: KeyboardEvent): void {
    const move = MOVE_KEYS[event.code];
    const action = ACTION_KEYS[event.code];
    if ((move === undefined && action === undefined) || isTyping(event.target)) return;
    event.preventDefault(); // Espaço e setas rolariam a página
    if (move !== undefined) keys[move] = true;
    if (action !== undefined && !event.repeat) onAction(action); // uma Action por tecla pressionada
  }

  function onKeyUp(event: KeyboardEvent): void {
    const move = MOVE_KEYS[event.code];
    if (move !== undefined) keys[move] = false;
  }

  // sem isto, soltar a tecla com a janela fora de foco deixa o Player andando sozinho
  function onBlur(): void {
    Object.assign(keys, released());
  }

  function onMouseMove(event: MouseEvent): void {
    if (document.pointerLockElement === canvas) mouseDx += event.movementX * sensitivity;
  }

  function onClick(): void {
    if (document.pointerLockElement === canvas) return;
    // o Chrome devolve uma Promise que rejeita se o pedido vier cedo demais depois de sair do lock
    Promise.resolve(canvas.requestPointerLock?.()).catch(() => {});
  }

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  document.addEventListener("mousemove", onMouseMove);
  canvas.addEventListener("click", onClick);

  return {
    keys,
    takeMouseDx() {
      const taken = mouseDx;
      mouseDx = 0;
      return taken;
    },
    dispose() {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("click", onClick);
      if (document.pointerLockElement === canvas) document.exitPointerLock?.();
    },
  };
}
