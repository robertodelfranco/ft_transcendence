// Espelho de backend/app/game/movement.py: a mesma ordem e as mesmas contas,
// para a Prediction não divergir do servidor (arq. §2). O applyInput.test.ts confere.
import {
  BODY_BLOCK_DISTANCE, MOUSE_MAX_ROT_SPEED, PLAYER_RADIUS,
  PLAYER_ROT_SPEED, PLAYER_SPEED, PLAYER_SPRINT_MULT,
} from "./rules";
import type { Keys } from "./types";

export interface Body {
  readonly x: number; // cél
  readonly y: number;
  readonly angle: number; // rad; norte = 0, dx = sin(angle), dy = -cos(angle)
}

export interface MoveInput {
  readonly keys: Keys;
  readonly mouse_dx: number; // rad
}

export interface CollisionWorld {
  readonly grid: readonly string[]; // o Grid atual, uma string por linha
  readonly bodies: readonly (readonly [number, number])[]; // centro de cada corpo que bloqueia
}

const SOLID_CHARS = "1 D"; // o mesmo de world.py: parede, fora do Map e Door

export function applyInput(body: Body, input: MoveInput, world: CollisionWorld, dt: number): Body {
  // a ordem é contrato (ws-messages.md §2.9): primeiro gira, depois anda
  const angle = turn(body.angle, input, dt);
  const [x, y] = walk(body.x, body.y, angle, input.keys, world, dt);
  return { x, y, angle };
}

function turn(angle: number, input: MoveInput, dt: number): number {
  // primeiro o mouse, cortado no limite; depois as teclas
  const maxTurn = MOUSE_MAX_ROT_SPEED * dt;
  angle += Math.max(-maxTurn, Math.min(maxTurn, input.mouse_dx));
  angle += (Number(input.keys.rot_right) - Number(input.keys.rot_left)) * PLAYER_ROT_SPEED * dt;
  return angle;
}

function walk(x: number, y: number, angle: number, keys: Keys, world: CollisionWorld,
  dt: number): [number, number] {
  const forward = Number(keys.up) - Number(keys.down);
  const strafe = Number(keys.right) - Number(keys.left);
  const length = Math.hypot(forward, strafe);
  if (length === 0) return [x, y];
  const speed = PLAYER_SPEED * (keys.sprint ? PLAYER_SPRINT_MULT : 1.0);
  const dirX = Math.sin(angle);
  const dirY = -Math.cos(angle);
  // frente = (dirX, dirY); direita = (-dirY, dirX)
  const stepX = (dirX * forward - dirY * strafe) / length * speed * dt;
  const stepY = (dirY * forward + dirX * strafe) / length * speed * dt;
  // um eixo de cada vez, primeiro o x: bloqueado num, o Player desliza no outro
  if (canMove(world, x, y, x + stepX, y)) x += stepX;
  if (canMove(world, x, y, x, y + stepY)) y += stepY;
  return [x, y];
}

function canMove(world: CollisionWorld, x: number, y: number, newX: number, newY: number): boolean {
  return fits(world, newX, newY) && !blockedByBody(world, x, y, newX, newY);
}

function fits(world: CollisionWorld, x: number, y: number): boolean {
  // os 4 cantos da caixa do Player, a PLAYER_RADIUS do centro
  for (const cornerX of [x - PLAYER_RADIUS, x + PLAYER_RADIUS]) {
    for (const cornerY of [y - PLAYER_RADIUS, y + PLAYER_RADIUS]) {
      if (isSolid(world.grid, cornerX, cornerY)) return false;
    }
  }
  return true;
}

export function isSolid(grid: readonly string[], x: number, y: number): boolean {
  const column = Math.floor(x);
  const row = Math.floor(y);
  // fora do Grid é sólido; em JS, grid[-1] seria undefined, não a outra ponta
  if (row < 0 || row >= grid.length || column < 0 || column >= grid[row].length) return true;
  return SOLID_CHARS.includes(grid[row][column]);
}

function blockedByBody(world: CollisionWorld, x: number, y: number, newX: number,
  newY: number): boolean {
  for (const [bodyX, bodyY] of world.bodies) {
    const newDistance = Math.hypot(newX - bodyX, newY - bodyY);
    // bloqueia quem chegaria perto demais; quem já está perto ainda pode se afastar
    if (newDistance < BODY_BLOCK_DISTANCE && newDistance < Math.hypot(x - bodyX, y - bodyY)) {
      return true;
    }
  }
  return false;
}
