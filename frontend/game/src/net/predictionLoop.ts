// Laço de passo fixo do cliente (roadmap R5.3). Um Input por 1/TICK_RATE s, nunca por quadro:
// é o mesmo dt que o servidor usa, então a Prediction anda igual (ws-messages.md §2.9).
import { applyInput, type Body, type CollisionWorld, type MoveInput } from "../applyInput";
import { TICK_RATE } from "../rules";
import type { ActionKind, ClientMessage, Keys, PlayerSnapshot, WelcomeMessage } from "../types";

const STEP_S = 1 / TICK_RATE;
// aba que volta do segundo plano não despeja centenas de Inputs: 5 passos são ~166 ms de jogo
export const MAX_STEPS_PER_FRAME = 5;

export interface PredictionLoop {
  start(welcome: WelcomeMessage): void;
  frame(frameDtS: number, keys: Keys, mouseDx: number): void; // a cada requestAnimationFrame
  action(kind: ActionKind): void;
  localPlayer(): PlayerSnapshot | null; // interpolado entre os dois últimos passos
}

interface Running {
  player: PlayerSnapshot; // hp, mana etc. do último estado do servidor
  world: CollisionWorld;
  previous: Body;
  current: Body;
  pending: { seq: number; input: MoveInput }[]; // o R7 reaplica estes depois de cada Snapshot
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
    state.current = applyInput(state.current, input, state.world, STEP_S);
    state.pending.push({ seq, input });
    send({ v: 1, type: "input", seq, keys: input.keys, mouse_dx: input.mouse_dx });
  }

  return {
    start(welcome) {
      const me = welcome.snapshot.players.find((player) => player.id === welcome.user_id);
      if (me === undefined) throw new Error("welcome without the local player");
      // dx = sin(angle), dy = -cos(angle)  →  angle = atan2(dx, -dy)
      const body: Body = { x: me.x, y: me.y, angle: Math.atan2(me.dx, -me.dy) };
      // corpos e grid_delta entram no R7, com o onSnapshot
      run = { player: me, world: { grid: welcome.map.grid, bodies: [] },
        previous: body, current: body, pending: [] };
      seq = 0; // recomeça a cada conexão (ws-messages.md §2.2)
      accumulatorS = 0;
      mouseDx = 0;
    },

    frame(frameDtS, keys, frameMouseDx) {
      if (run === null) return;
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
        x: previous.x + (current.x - previous.x) * alpha,
        y: previous.y + (current.y - previous.y) * alpha,
        dx: Math.sin(angle),
        dy: -Math.cos(angle),
      };
    },
  };
}
