// Laço de passo fixo do cliente (roadmap R5.3). Um Input por 1/TICK_RATE s, nunca por quadro:
// é o mesmo dt que o servidor usa, então a Prediction anda igual (ws-messages.md §2.9).
import { applyInput, type Body, type CollisionWorld, type MoveInput } from "../applyInput";
import { TICK_RATE } from "../rules";
import type { ActionKind, ClientMessage, Keys, PlayerSnapshot, Snapshot, WelcomeMessage } from "../types";
import { reconcilePlayer, type PendingInput } from "./reconciliation";
import { applyGridDelta } from "./viewstate";

const STEP_S = 1 / TICK_RATE;
const SMOOTH_DISTANCE = 0.05; // célula
const SMOOTH_TIME_S = 0.1;
const FLOAT_NOISE_DISTANCE = 1e-9; // não reinicia a correção por arredondamento
// aba que volta do segundo plano não despeja centenas de Inputs: 5 passos são ~166 ms de jogo
export const MAX_STEPS_PER_FRAME = 5;

export interface PredictionLoop {
  start(welcome: WelcomeMessage): void;
  onSnapshot(snapshot: Snapshot): void;
  frame(frameDtS: number, keys: Keys, mouseDx: number): void; // a cada requestAnimationFrame
  action(kind: ActionKind): void;
  localPlayer(): PlayerSnapshot | null; // interpolado entre os dois últimos passos
}

interface Running {
  player: PlayerSnapshot; // hp, mana etc. do último estado do servidor
  baseGrid: string[];
  world: CollisionWorld;
  previous: Body;
  current: Body;
  pending: PendingInput[];
  visualOffset: { x: number; y: number; remainingS: number };
}

function worldFromSnapshot(
  snapshot: Snapshot,
  grid: string[],
  userId: number,
): CollisionWorld {
  const bodies: [number, number][] = [];

  for (const player of snapshot.players) {
    if (player.id !== userId && player.alive) {
      bodies.push([player.x, player.y]);
    }
  }
  for (const enemy of snapshot.enemies) {
    if (enemy.state !== "dying") bodies.push([enemy.x, enemy.y]);
  }
  const boss = snapshot.boss;
  if (boss !== null && boss.state !== "dying") {
    bodies.push([boss.x, boss.y]);
  }

  return { grid, bodies };
}

export function createPredictionLoop(send: (message: ClientMessage) => void): PredictionLoop {
  let run: Running | null = null;
  let seq = 0;
  let accumulatorS = 0;
  let mouseDx = 0; // giro acumulado desde o último Input

  function step(state: Running, keys: Keys): void {
    const input: MoveInput = { keys: { ...keys }, mouse_dx: mouseDx }; // cópia: quem chama reusa o objeto
    mouseDx = 0;
    seq += 1;
    state.previous = state.current;
    if (state.player.alive) {
      state.current = applyInput(state.current, input, state.world, STEP_S);
    }
    state.pending.push({ seq, input });
    send({ v: 1, type: "input", seq, keys: input.keys, mouse_dx: input.mouse_dx });
  }

  return {
    start(welcome) {
      const me = welcome.snapshot.players.find((player) => player.id === welcome.user_id);
      if (me === undefined) throw new Error("welcome without the local player");
      const grid = applyGridDelta(welcome.map.grid, welcome.snapshot.grid_delta);
      const world = worldFromSnapshot(welcome.snapshot, grid, me.id);
      const { body } = reconcilePlayer(
        me, welcome.snapshot.last_input_seq, [], world,
      );

      run = {
        player: me,
        baseGrid: welcome.map.grid,
        world,
        previous: body,
        current: body,
        pending: [],
        visualOffset: { x: 0, y: 0, remainingS: 0 },
      };
      seq = 0; // recomeça a cada conexão (ws-messages.md §2.2)
      accumulatorS = 0;
      mouseDx = 0;
    },

    onSnapshot(snapshot) {
      const state = run;
      if (state === null) return;

      const me = snapshot.players.find(player => player.id === state.player.id);
      if (me === undefined) throw new Error("snapshot without the local player");

      const grid = applyGridDelta(state.baseGrid, snapshot.grid_delta);
      const world = worldFromSnapshot(snapshot, grid, me.id);
      const { body, pending } = reconcilePlayer(
        me, snapshot.last_input_seq, state.pending, world,
      );
      const correction = {
        x: body.x - state.current.x,
        y: body.y - state.current.y,
        angle: body.angle - state.current.angle,
      };
      const error = Math.hypot(correction.x, correction.y);
      const sameLife = me.alive === state.player.alive;
      if (import.meta.env.DEV && sameLife && me.alive) {
        console.assert(error < SMOOTH_DISTANCE, "prediction diverged", { error, tick: snapshot.tick });
      }
      const smooth = sameLife && me.alive && error < SMOOTH_DISTANCE;
      const visualOffset = smooth ? {
        // previous e current mudam juntos; o offset preserva a posição desenhada.
        x: state.visualOffset.x - correction.x,
        y: state.visualOffset.y - correction.y,
        remainingS: error > FLOAT_NOISE_DISTANCE ? SMOOTH_TIME_S : state.visualOffset.remainingS,
      } : { x: 0, y: 0, remainingS: 0 };

      run = {
        ...state,
        player: me,
        world,
        current: body,
        pending,
        visualOffset,
        previous: sameLife ? {
          x: state.previous.x + correction.x,
          y: state.previous.y + correction.y,
          angle: state.previous.angle + correction.angle,
        } : body,
      };
    },

    frame(frameDtS, keys, frameMouseDx) {
      if (run === null) return;
      if (run.visualOffset.remainingS > 0) {
        const remainingS = run.visualOffset.remainingS;
        const factor = Math.max(0, 1 - frameDtS / remainingS);
        run.visualOffset = {
          x: run.visualOffset.x * factor,
          y: run.visualOffset.y * factor,
          remainingS: Math.max(0, remainingS - frameDtS),
        };
      }
      mouseDx += frameMouseDx;
      accumulatorS += frameDtS;
      let steps = 0;
      while (accumulatorS >= STEP_S && steps < MAX_STEPS_PER_FRAME) {
        step(run, keys);
        accumulatorS -= STEP_S;
        steps += 1;
      }
      if (accumulatorS >= STEP_S) accumulatorS = 0; // quadro longo demais: o resto é descartado
    },

    action(kind) {
      if (run === null) return;
      seq += 1; // o mesmo contador do Input: a fila do servidor segue a ordem do seq
      send({ v: 1, type: "action", seq, kind });
    },

    localPlayer() {
      if (run === null) return null;
      const { previous, current } = run;
      const alpha = accumulatorS / STEP_S;
      const angle = previous.angle + (current.angle - previous.angle) * alpha;
      return {
        ...run.player,
        x: previous.x + (current.x - previous.x) * alpha + run.visualOffset.x,
        y: previous.y + (current.y - previous.y) * alpha + run.visualOffset.y,
        dx: Math.sin(angle),
        dy: -Math.cos(angle),
      };
    },
  };
}
