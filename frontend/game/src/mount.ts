import { createGameAudio, RESULT_MUSIC_S, type GameAudio } from "./audio/gameAudio";
// Liga socket, laço de Input, teclado e Renderer atrás de mountGame (mount-game.md §2.6 e §5.2).
// O Renderer chega por fábrica: o laço não conhece Three.js, e os testes usam um falso.
import type { EndResult, HudState, HudStatus, MountedGame, MountOptions } from "./api";
import { captureInput, MOUSE_SENSITIVITY } from "./net/input";
import { createInterpolator, type Interpolator } from "./net/interpolation";
import { createPredictionLoop } from "./net/predictionLoop";
import { createGameSocket, type WebSocketFactory } from "./net/socket";
import { buildHud, buildViewState, createGridTracker, emptyHud, type Killfeed,
  type ViewState } from "./net/viewstate";
import { Minimap } from "./render/minimap";
import { createPlayerFeedback } from "./render/playerFeedback";
import { BOSS_DYING_S, FIREBALL_CHARGE_S, FIREBALL_CHARGED_MANA_MULT, RULESET_NUMBERS } from "./rules";
import { isFrozen } from "./net/countdown";
import type { EventMessage, GridCell, RoomOptions, ServerMessage, Snapshot,
  WelcomeMessage } from "./types";

// proposta para mount-game.md §5.5: as últimas 5 eliminações
const KILLFEED_MAX = 5;
// proposta mount-game.md §5.5: um ping a cada 2 s; RTT em ms
const PING_INTERVAL_MS = 2000;

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
  createAudio?: () => GameAudio;
}

export function defaultWsUrl(matchId: number): string {
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${location.host}/ws/game/${matchId}`;
}

export function createMountGame(deps: GameDeps) {
  return function mountGame(canvas: HTMLCanvasElement, opts: MountOptions): MountedGame {
    let welcome: WelcomeMessage | null = null;
    let trackGrid: ((delta: GridCell[]) => string[]) | null = null;
    let interpolator: Interpolator | null = null;
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
    let ping: number | null = null;
    let pinger: ReturnType<typeof setInterval> | null = null;

    const minimap = opts.minimapCanvas ? new Minimap(opts.minimapCanvas) : null;
    const feedback = createPlayerFeedback();
    const audio = (deps.createAudio ?? createGameAudio)();
    let audioReady = false;
    let unlocking = false;
    let previousPosition: { x: number; y: number } | null = null;
    let stepDistance = 0;

    function audioActive(): boolean {
      return !unmounted && status === "running" && ending === null && !document.hidden;
    }

    function syncAudio(): void {
      if (!audioActive()) { feedback.clearTransient(); input.cancelCharge(); }
      previousPosition = null;
      stepDistance = 0;
      if (audioReady && audioActive()) audio.startMusic();
      else audio.stopAll();
    }

    function unlockAudio(event: Event): void {
      if (event instanceof KeyboardEvent) {
        const target = event.target;
        if (event.repeat || !(event.code === "Space" || event.code === "KeyF"
          || ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowLeft", "ArrowRight"].includes(event.code))) return;
        if (target instanceof HTMLElement && (target.isContentEditable
          || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      }
      if (unlocking || unmounted || ending !== null || status === "finished" || status === "error") return;
      unlocking = true;
      void audio.unlock().then(() => {
        if (!unmounted) {
          audioReady = true;
          syncAudio();
        }
      }).catch(() => {
        // Audio facultativo: uma nova interação permite tentar novamente sem encerrar a Room.
        audioReady = false;
      }).finally(() => { unlocking = false; });
    }

    canvas.addEventListener("click", unlockAudio);
    window.addEventListener("keydown", unlockAudio);
    document.addEventListener("visibilitychange", syncAudio);
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
    const input = captureInput(canvas, (kind, heldSeconds = 0) => {
      loop.action(kind); // duração local nunca vai ao servidor
      if (kind === "fire" || kind === "charge_cancel") audio.updateCharge(null);
      if (kind === "fire" && welcome && audioReady && audioActive()) {
        const player = loop.localPlayer();
        const cost = RULESET_NUMBERS[welcome.room.mode].FIREBALL_MANA_COST
          * (heldSeconds >= FIREBALL_CHARGE_S ? FIREBALL_CHARGED_MANA_MULT : 1);
        if (player?.alive && player.mana >= cost) audio.playFire();
      }
    }, MOUSE_SENSITIVITY, () => status === "running" && ending === null
      && !document.hidden && snapshot !== null && !isFrozen(snapshot)
      && loop.localPlayer()?.alive === true);
    const resizer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
    resizer?.observe(canvas);
    if (opts.minimapCanvas) resizer?.observe(opts.minimapCanvas);

    function hud(): HudState {
      if (welcome === null || snapshot === null) {
        return emptyHud(status, welcome?.room.mode ?? null, error);
      }
      const context = { userId: welcome.user_id, mode: welcome.room.mode,
        options: welcome.room.options };
      const state = { ...buildHud(snapshot, context, killfeed, status), ping };
      return error === undefined ? state : { ...state, error };
    }

    // só depois do welcome: numa Reconnection o join ainda espera o token, e o servidor fecha
    // com 4400 qualquer mensagem que chegue antes dele
    function sendPing(): void {
      if (status === "running") socket.send({ v: 1, type: "ping", t: performance.now() });
    }

    // cada welcome recomeça a contagem: o primeiro ping sai já, os outros a cada 2 s
    function startPinging(): void {
      if (pinger !== null) clearInterval(pinger);
      sendPing();
      pinger = setInterval(sendPing, PING_INTERVAL_MS);
    }

    // o servidor devolve o t intacto: o RTT sai do relógio do próprio cliente, sem sincronizar
    // relógios entre as máquinas
    function onPong(t: number): void {
      if (!Number.isFinite(t)) return fail("invalid_message"); // senão a HUD mostra NaN
      ping = performance.now() - t;
      emitHud();
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
      syncAudio();
      emitHud();
    }

    function fail(code: string): void {
      if (status === "error" || status === "finished") return;
      error = code;
      status = "error";
      syncAudio();
      socket.close();
      emitHud();
    }

    // depois do game_over não há partida para onde voltar: o servidor recusaria com 4404
    function onReconnecting(): void {
      ping = null; // a medida da conexão que caiu não diz nada da próxima
      if (ending === null) setStatus("disconnected");
      else socket.close();
    }

    function receive(message: ServerMessage): void {
      try {
        switch (message.type) {
          case "welcome": return onWelcome(message);
          case "snapshot": return onSnapshot(message);
          case "event": return onEvent(message);
          case "pong": return onPong(message.t);
          case "error": return; // o socket decide pelo código do close
        }
      } catch {
        // campo faltando ou de outro tipo: vira erro na HUD, e não exceção no console
        fail("invalid_message");
      }
    }

    // vem também em cada Reconnection: o laço recomeça o seq, o Renderer não é refeito
    function onWelcome(message: WelcomeMessage): void {
      input.cancelCharge();
      welcome = message;
      feedback.reset();
      trackGrid = createGridTracker(message.map.grid);
      interpolator = createInterpolator(message.user_id); // cada Reconnection começa um buffer novo
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
      syncAudio();
      emitHud(); // um onHud só por welcome, já com o status novo
      startPinging();
    }

    function onSnapshot(next: Snapshot): void {
      if (welcome === null) return;
      loop.onSnapshot(next);
      applySnapshot(next);
      emitHud();
    }

    function applySnapshot(next: Snapshot): void {
      if (welcome === null || trackGrid === null) return;
      // O Snapshot abastece o mundo e a HUD; o frame aplica a pose prevista do Player local.
      view = buildViewState(next, trackGrid(next.grid_delta), welcome.user_id, welcome.room.mode);
      interpolator?.push(next, performance.now()); // o mesmo relógio do nowMs do rAF
      snapshot = next;
      const localId = welcome.user_id;
      const localPlayer = next.players.find(player => player.id === localId);
      if (!localPlayer?.alive || isFrozen(next)) input.cancelCharge();
      if (localPlayer) {
        feedback.snapshot(localPlayer.alive, welcome.room.mode, performance.now());
        if (status !== "running" || ending !== null || document.hidden) feedback.clearTransient();
      }
    }

    function onEvent(message: EventMessage): void {
      if (audioReady && audioActive() && message.name === "door_opened") {
        const listener = loop.localPlayer();
        if (listener) {
          const distance = Math.hypot(message.data.x + 0.5 - listener.x,
            message.data.y + 0.5 - listener.y);
          const volume = Math.max(0, 1 - distance / 8) ** 2;
          if (volume > 0) audio.playDoor(volume);
        }
      }
      if (audioReady && audioActive() && message.name === "item_picked"
          && message.data.by === welcome?.user_id) {
        audio.playPickup();
      }
      if (audioActive() && message.name === "player_hit"
          && message.data.target === welcome?.user_id
          && message.data.amount + message.data.absorbed > 0) {
        feedback.hit(performance.now());
      }
      if (audioReady && audioActive() && message.name === "player_hit"
          && (message.data.target === welcome?.user_id || message.data.by === welcome?.user_id)) {
        audio.playHit();
      }
      if (message.name === "player_died") {
        const { player_id, by } = message.data;
        killfeed = [...killfeed, { by, victim: player_id, tick: message.tick }].slice(-KILLFEED_MAX);
        emitHud();
      } else if (message.name === "game_over" && ending === null) {
        audio.stopAll();
        feedback.clearTransient();
        const { result, winner_ids, reason } = message.data;
        if (audioReady && audioActive() && welcome) {
          if (result === "draw") audio.playDraw();
          else if (result === "win" && winner_ids.includes(welcome.user_id)) audio.playVictory();
          else audio.playDefeat();
        }
        const end: EndResult = { result, winnerIds: winner_ids, reason };
        // Aguarda a animação do Boss e a melodia de resultado antes da tela final.
        // O socket continua recebendo Snapshots durante essa espera.
        ending = setTimeout(() => {
          setStatus("finished");
          if (!unmounted) opts.onEnd(end);
        }, Math.max(BOSS_DYING_S, RESULT_MUSIC_S + 0.2) * 1000);
      }
    }

    function resize(): void {
      if (unmounted) return;
      minimap?.resize();
      if (rendererReady) renderer.resize(canvas.clientWidth, canvas.clientHeight);
    }

    function frame(nowMs: number): void {
      frameId = requestAnimationFrame(frame);
      const dtS = lastFrameMs === null ? 0 : (nowMs - lastFrameMs) / 1000;
      lastFrameMs = nowMs;
      const mouseDx = input.takeMouseDx(); // lido sempre, para não acumular giro fora da partida
      if (status === "running" && ending === null) loop.frame(dtS, input.keys, mouseDx);
      const position = loop.localPlayer();
      if (!audioActive() || !position?.alive) input.cancelCharge();
      const chargeSeconds = input.chargeSeconds;
      if (audioReady) audio.updateCharge(audioActive() ? chargeSeconds : null);
      const moving = input.keys.up || input.keys.down || input.keys.left || input.keys.right;
      if (audioReady && audioActive() && position?.alive && moving) {
        if (previousPosition !== null) {
          const distance = Math.hypot(position.x - previousPosition.x, position.y - previousPosition.y);
          // Ignora saltos de respawn/correção e não recupera passos de uma aba suspensa.
          if (distance < 0.5 && dtS < 0.2) {
            stepDistance += distance;
            if (stepDistance >= 0.7) {
              audio.playStep();
              stepDistance %= 0.7;
            }
          } else stepDistance = 0;
        }
        previousPosition = { x: position.x, y: position.y };
      } else {
        previousPosition = null;
        stepDistance = 0;
      }
      if (rendererReady && view !== null) {
        const predicted = ending === null && status !== "finished"
          ? loop.localPlayer()
          : null;

        const drawing = predicted === null ? view : {
          ...view,
          localPlayer: predicted,
          camera: predicted.alive ? {
            ...view.camera,
            x: predicted.x,
            y: predicted.y,
            dx: predicted.dx,
            dy: predicted.dy,
          } : view.camera,
        };

        // os outros, os Enemies, o Boss e os Projectiles a now − 100 ms (F2.8)
        const others = interpolator?.sample(nowMs) ?? null;
        const rendered = others === null ? drawing : { ...drawing, ...others };
        const showingFeedback = status === "running" && ending === null && !document.hidden;
        renderer.render({ ...rendered, chargeSeconds,
          feedback: showingFeedback ? feedback.state(nowMs) : undefined }, dtS);
        minimap?.render(rendered, canvas.clientWidth / canvas.clientHeight || 1);
      }
    }

    emitHud();
    frameId = requestAnimationFrame(frame);

    return {
      unmount() {
        if (unmounted) return;
        unmounted = true;
        feedback.reset();
        if (frameId !== null) cancelAnimationFrame(frameId);
        if (ending !== null) clearTimeout(ending);
        canvas.removeEventListener("click", unlockAudio);
        window.removeEventListener("keydown", unlockAudio);
        document.removeEventListener("visibilitychange", syncAudio);
        void audio.dispose().catch(() => { /* A Room já foi desmontada. */ });
        if (pinger !== null) clearInterval(pinger);
        socket.close();
        input.dispose();
        resizer?.disconnect();
        renderer.dispose(); // também no meio do init: o Renderer libera o que já tinha criado
        minimap?.dispose();
      },
    };
  };
}
