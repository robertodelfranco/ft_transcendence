import type { EndResult, HudState, MountOptions } from "../../game/src/index";

// O jogo falso de todos os testes (vitest.setup.ts): o jsdom não tem WebGL e o /ws/game não tem mock.
// Guarda cada montagem para o teste emitir HUD e fim como o jogo de verdade faria
export interface FakeMount {
  canvas: HTMLCanvasElement;
  options: MountOptions;
  unmounted: boolean;
}

export const mounts: FakeMount[] = [];
let failing = false;

export function hudState(overrides: Partial<HudState> = {}): HudState {
  return {
    hp: 10, maxHp: 10, mana: 60, maxMana: 100, armor: 0, keys: 0, alive: true, ping: null,
    players: [], scoreboard: null, killfeed: [], mode: "coop", status: "running", ...overrides,
  };
}

export function failNextMount(): void {
  failing = true;
}

export function mountGame(canvas: HTMLCanvasElement, options: MountOptions) {
  if (failing) {
    failing = false;
    throw new Error("webgl");
  }
  const mount: FakeMount = { canvas, options, unmounted: false};
  mounts.push(mount);
  options.onHud(hudState({ status: "connecting", mode: null }));
  return { unmount: () => { mount.unmounted = true } };
}

export function activeMount(): FakeMount | undefined {
  return mounts.findLast((mount) => !mount.unmounted);
}

export function emitHud(overrides: Partial<HudState> = {}): void {
  activeMount()?.options.onHud(hudState(overrides));
}

export function emitEnd(result: EndResult): void {
  activeMount()?.options.onEnd(result);
}

export function resetGameMock(): void {
  mounts.length = 0;
  failing = false;
}