// Liga socket, laço de Input, teclado e Renderer atrás de mountGame (mount-game.md §2.6 e §5.2).
// O Renderer chega por fábrica: o laço não conhece Three.js, e os testes usam um falso.
import type { EndResult, HudState, HudStatus, MountedGame, MountOptions } from "./api";
import { captureInput } from "./net/input";
import { createPredictionLoop } from "./net/predictionLoop";
import { createGameSocket, type WebSocketFactory } from "./net/socket";
import { buildHud, buildViewState, createGridTracker, emptyHud, type Killfeed,
  type ViewState } from "./net/viewstate";
import { BOSS_DYING_S } from "./rules";
import type { EventMessage, GridCell, RoomOptions, ServerMessage, Snapshot,
  WelcomeMessage } from "./types";

// proposta para mount-game.md §5.5: as últimas 5 eliminações
const KILLFEED_MAX = 5;

// O que o jogo precisa de um Renderer; a fábrica junta o AssetLoader e o ThreeRenderer
export interface SceneRenderer {
  init(map: { grid: string[] }, theme: RoomOptions["theme"]): Promise<void>;
  render(view: ViewState, dt: number): void;
  resize(width: number, height: number): void;
  dispose(): void;
}

export interface GameDeps {
  createRenderer: (canvas: HTMLCanvasElement) => SceneRenderer;
  createWebSocket?: WebSocketFactory;
}

export function defaultWsUrl(matchId: number): string {
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${location.host}/ws/game/${matchId}`;
}

export function createMountGame(deps: GameDeps) {
  return function mountGame(canvas: HTMLCanvasElement, opts: MountOptions): MountedGame {
    let welcome: WelcomeMessage | null = null;
    let trackGrid: ((delta: GridCell[]) => string[]) | null = null;
    let snapshot: Snapshot | null = null;
    let view: ViewState | null = null;
    let killfeed: Killfeed = [];
    let status: HudStatus = "connecting";
    let error: string | undefined;
    let lastHud = "";
    let rendererReady = false;
    let rendererStarted = false;
    let unmounted = false;
    let ending: ReturnType<typeof setTimeout> | null = null;
    let frameId: number | null = null;
    let lastFrameMs: number | null = null;

    const renderer = deps.createRenderer(canvas);
    const socket = createGameSocket({
      url: opts.wsUrl ?? defaultWsUrl(opts.matchId),
      matchId: opts.matchId,
      getAccessToken: opts.getAccessToken,
      onMessage: receive,
      onReconnecting,
      onClosed: (code) => {
        if (ending !== null) return; // o resultado já chegou; o fim é pelo timer do game_over
        if (code === null) setStatus("finished");
        else fail(code);
      },
      createWebSocket: deps.createWebSocket,
    });
    const loop = createPredictionLoop((message) => socket.send(message));
    const input = captureInput(canvas, (kind) => loop.action(kind));
    const resizer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
    resizer?.observe(canvas);

    function hud(): HudState {
      if (welcome === null || snapshot === null) return emptyHud(status, error);
      const context = { userId: welcome.user_id, mode: welcome.room.mode,
        options: welcome.room.options };
      const state = buildHud(snapshot, context, killfeed, status);
      return error === undefined ? state : { ...state, error };
    }

    // só avisa a casca quando algo mudou: a maioria dos Snapshots não mexe em HP, Mana ou placar,
    // e cada onHud é um render do React
    function emitHud(): void {
      if (unmounted) return;
      const state = hud();
      const key = JSON.stringify(state);
      if (key === lastHud) return;
      lastHud = key;
      opts.onHud(state);
    }

    function setStatus(next: HudStatus): void {
      // fim e erro não voltam atrás: um close atrasado não apaga o resultado
      if (status === next || status === "finished" || status === "error") return;
      status = next;
      emitHud();
    }

    function fail(code: string): void {
      if (status === "error" || status === "finished") return;
      error = code;
      status = "error";
      socket.close();
      emitHud();
    }

    // depois do game_over não há partida para onde voltar: o servidor recusaria com 4404
    function onReconnecting(): void {
      if (ending === null) setStatus("disconnected");
      else socket.close();
    }

    function receive(message: ServerMessage): void {
      try {
        switch (message.type) {
          case "welcome": return onWelcome(message);
          case "snapshot": return onSnapshot(message);
          case "event": return onEvent(message);
          case "pong": return; // RTT entra com a F2.12
          case "error": return; // o socket decide pelo código do close
        }
      } catch {
        // campo faltando ou de outro tipo: vira erro na HUD, e não exceção no console
        fail("invalid_message");
      }
    }

    // vem também em cada Reconnection: o laço recomeça o seq, o Renderer não é refeito
    function onWelcome(message: WelcomeMessage): void {
      welcome = message;
      trackGrid = createGridTracker(message.map.grid);
      try {
        loop.start(message);
      } catch {
        return fail("invalid_message"); // welcome sem o Player local
      }
      if (!rendererStarted) {
        rendererStarted = true;
        renderer.init(message.map, message.room.options.theme).then(() => {
          if (unmounted) return;
          rendererReady = true;
          resize();
        }, () => {
          if (!unmounted) fail("asset_load_failed");
        });
      }
      applySnapshot(message.snapshot);
      if (status === "connecting" || status === "disconnected") status = "running";
      emitHud(); // um onHud só por welcome, já com o status novo
    }

    function onSnapshot(next: Snapshot): void {
      if (welcome === null) return;
      applySnapshot(next);
      emitHud();
    }

    function applySnapshot(next: Snapshot): void {
      if (welcome === null || trackGrid === null) return;
      // sem Prediction ainda: o Player local é desenhado onde o servidor diz (F2.7 troca isto)
      view = buildViewState(next, trackGrid(next.grid_delta), welcome.user_id, welcome.room.mode);
      snapshot = next;
    }

    function onEvent(message: EventMessage): void {
      if (message.name === "player_died") {
        const { player_id, by } = message.data;
        killfeed = [...killfeed, { by, victim: player_id, tick: message.tick }].slice(-KILLFEED_MAX);
        emitHud();
      } else if (message.name === "game_over" && ending === null) {
        const { result, winner_ids, reason } = message.data;
        const end: EndResult = { result, winnerIds: winner_ids, reason };
        // espera a animação de morte do Boss antes da tela de fim (mount-game.md §5.5);
        // o socket fica aberto para os Snapshots dessa animação continuarem chegando
        ending = setTimeout(() => {
          setStatus("finished");
          if (!unmounted) opts.onEnd(end);
        }, BOSS_DYING_S * 1000);
      }
    }

    function resize(): void {
      if (rendererReady && !unmounted) renderer.resize(canvas.clientWidth, canvas.clientHeight);
    }

    function frame(nowMs: number): void {
      frameId = requestAnimationFrame(frame);
      const dtS = lastFrameMs === null ? 0 : (nowMs - lastFrameMs) / 1000;
      lastFrameMs = nowMs;
      const mouseDx = input.takeMouseDx(); // lido sempre, para não acumular giro fora da partida
      if (status === "running" && ending === null) loop.frame(dtS, input.keys, mouseDx);
      if (rendererReady && view !== null) renderer.render(view, dtS);
    }

    emitHud();
    frameId = requestAnimationFrame(frame);

    return {
      unmount() {
        if (unmounted) return;
        unmounted = true;
        if (frameId !== null) cancelAnimationFrame(frameId);
        if (ending !== null) clearTimeout(ending);
        socket.close();
        input.dispose();
        resizer?.disconnect();
        renderer.dispose(); // também no meio do init: o Renderer libera o que já tinha criado
      },
    };
  };
}
