import * as THREE from "three";

export const SIZE = 64; // texels por célula, a mesma densidade das paredes
const DASHES = 22; // traços por célula: a água funda da parede é quase lisa
// Paleta da água pintada nas paredes 5–8: fundo azul, traços azul-claro, ciano raro.
export const BASE = [0, 0, 168] as const;
export const PALETTE = [[0, 168, 168], [84, 84, 252], [0, 168, 168], [84, 84, 252], [84, 252, 252]] as const;
export const FLOW = { x: 0.06, y: 0.02 }; // células por segundo: a correnteza do esgoto

// Gerador fixo (LCG): o mesmo desenho em todo cliente e nos testes, sem PNG nem canvas.
function seeded(seed: number): () => number {
  let state = seed;
  return () => (state = (state * 16807) % 2147483647) / 2147483647;
}

// Uma célula de água em pixel art, repetida pelo chão: traços horizontais curtos, como na parede.
export function createWaterTexture(width: number, depth: number, random = seeded(42)): THREE.DataTexture {
  const data = new Uint8Array(SIZE * SIZE * 4);
  for (let i = 0; i < SIZE * SIZE; i++) data.set([...BASE, 255], i * 4);
  for (let n = 0; n < DASHES; n++) {
    const x0 = Math.floor(random() * SIZE);
    const y = Math.floor(random() * SIZE);
    const length = 2 + Math.floor(random() * 4);
    const color = PALETTE[Math.floor(random() * PALETTE.length)];
    // % SIZE: o traço que passa da borda continua do outro lado, sem emenda entre células.
    for (let i = 0; i < length; i++) data.set([...color, 255], (y * SIZE + (x0 + i) % SIZE) * 4);
  }
  const texture = new THREE.DataTexture(data, SIZE, SIZE);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(width, depth); // uma célula de textura por célula do Grid
  // Igual aos anéis: pixel nítido de perto, mipmap de longe para não piscar.
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

// A correnteza é só visual e depende de dt, não do FPS. % 1: o offset não cresce sem limite.
export function flowWater(texture: THREE.Texture, dt: number): void {
  const seconds = Number.isFinite(dt) ? Math.max(0, dt) : 0;
  texture.offset.x = (texture.offset.x + FLOW.x * seconds) % 1;
  texture.offset.y = (texture.offset.y + FLOW.y * seconds) % 1;
}
