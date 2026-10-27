// Do Snapshot do servidor para o que o Renderer desenha e a casca mostra (mount-game.md §2.2 e §5.1).
// Funções puras: sem socket, sem relógio, sem Three.js.
import type { HudState, HudStatus } from "../api";
import type { ViewState } from "../render/renderer";
import { RULESET_NUMBERS } from "../rules";
import type { GridCell, Mode, RoomOptions, Snapshot } from "../types";

export type { ViewState }; // o tipo é do Renderer (mount-game.md §5.1); o net/ só o preenche

export type Killfeed = HudState["killfeed"];

// O delta é acumulado desde o welcome: aplica sempre sobre o Grid inicial, nunca sobre o anterior,
// porque um Snapshot descartado no caminho não pode fazer o cliente perder uma Door (ws-messages.md §4)
export function applyGridDelta(base: string[], delta: GridCell[]): string[] {
  if (delta.length === 0) return base;
  const rows = new Map<number, string[]>();
  for (const { x, y, c } of delta) {
    if (y < 0 || y >= base.length || x < 0 || x >= base[y].length) continue;
    let row = rows.get(y);
    if (row === undefined) {
      row = [...base[y]];
      rows.set(y, row);
    }
    row[x] = c;
  }
  return base.map((line, y) => rows.get(y)?.join("") ?? line);
}

const sameCell = (a: GridCell, b: GridCell) => a.x === b.x && a.y === b.y && a.c === b.c;

// O delta só muda quando uma Door abre ou um Pickup é coletado. Entre um e outro devolve o mesmo
// array: não refaz as linhas 15 vezes por segundo, e o Renderer vê que nada mudou pela referência
export function createGridTracker(base: string[]): (delta: GridCell[]) => string[] {
  let lastDelta: GridCell[] = [];
  let grid = base;
  return (delta) => {
    const same = delta.length === lastDelta.length
      && delta.every((cell, index) => sameCell(cell, lastDelta[index]));
    if (!same) {
      grid = applyGridDelta(base, delta);
      lastDelta = delta;
    }
    return grid;
  };
}

// null enquanto o Player local não está no Snapshot: o Renderer só desenha com ele (mount-game.md §5.1)
// grid é o Grid atual, já com o grid_delta aplicado
export function buildViewState(snapshot: Snapshot, grid: string[], userId: number,
  mode: Mode): ViewState | null {
  const localPlayer = snapshot.players.find((player) => player.id === userId);
  if (localPlayer === undefined) return null;
  const otherPlayers = snapshot.players.filter((player) => player.id !== userId);
  // morto no coop, a câmera acompanha um companheiro vivo; no pvp fica no próprio corpo até o respawn
  const watched = !localPlayer.alive && mode === "coop"
    ? otherPlayers.find((player) => player.alive) ?? localPlayer
    : localPlayer;
  return {
    localPlayer,
    otherPlayers,
    enemies: snapshot.enemies,
    boss: snapshot.boss,
    projectiles: snapshot.projectiles,
    doors: snapshot.doors,
    grid,
    camera: { x: watched.x, y: watched.y, dx: watched.dx, dy: watched.dy, pitch: 0 },
  };
}

export interface HudContext {
  userId: number;
  mode: Mode;
  options: RoomOptions;
}

// Antes do primeiro Snapshot a casca já recebe um HudState válido, com os números zerados;
// o Mode chega no welcome, então entre ele e o primeiro Snapshot já vem preenchido
export function emptyHud(status: HudStatus, mode: Mode | null, error?: string): HudState {
  return { hp: 0, maxHp: 0, mana: 0, maxMana: 0, armor: 0, keys: 0, alive: false, ping: null,
    players: [], scoreboard: null, killfeed: [], mode, status,
    ...(error === undefined ? {} : { error }) };
}

export function buildHud(snapshot: Snapshot, context: HudContext, killfeed: Killfeed,
  status: HudStatus): HudState {
  const me = snapshot.players.find((player) => player.id === context.userId);
  return {
    hp: me?.hp ?? 0,
    maxHp: context.options.start_hp,
    mana: me?.mana ?? 0,
    maxMana: RULESET_NUMBERS[context.mode].MANA_MAX,
    armor: me?.armor ?? 0,
    keys: me?.keys ?? 0,
    alive: me?.alive ?? false,
    ping: null,
    players: snapshot.players.map(({ id, name, hp, alive, connected }) =>
      ({ id, name, hp, alive, connected })),
    scoreboard: snapshot.scoreboard === null ? null
      : { players: snapshot.scoreboard.players, timeLeftS: snapshot.scoreboard.time_left_s },
    killfeed,
    mode: context.mode,
    status,
  };
}
