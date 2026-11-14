import type { ViewState } from "./renderer";

const CONE_LENGTH_CELLS = 3;
// Radar: quantas células cabem do centro até a borda do círculo. Zoom fixo, independente do mapa
export const VIEW_RADIUS_CELLS = 6;
// Companheiro além da borda fica preso nela, um pouco para dentro, apontando para onde está
const EDGE_INSET_CELLS = 0.45;

// Ângulo que leva o olhar do Player para o topo do radar. O Grid usa x para colunas e y para linhas,
// como a cena 3D (norte é y menor), e o canvas também tem y para baixo: o atan2 vale nos dois.
// Olhando para o norte (0, -1), o ângulo é zero e o radar fica como o mapa
export function headingUpAngle(dx: number, dy: number): number {
  return -Math.PI / 2 - Math.atan2(dy, dx);
}

// Ponto do radar para um Player: dentro do raio, onde está; fora, na borda, na mesma direção
export function clampToRadar(x: number, y: number, cx: number, cy: number, edge: number) {
  const ox = x - cx;
  const oy = y - cy;
  const distance = Math.hypot(ox, oy);
  if (distance <= edge) return { x, y, clamped: false };
  return { x: cx + (ox / distance) * edge, y: cy + (oy / distance) * edge, clamped: true };
}

// Radar no estilo de jogo de mundo aberto: círculo centrado no Player local, zoom fixo, e o mapa gira
// para que o olhar do Player aponte sempre para cima, como a cena 3D à frente dele
export function drawMinimap(ctx: CanvasRenderingContext2D, view: ViewState,
  width: number, height: number, sceneAspect: number): void {
  const rows = view.grid.length;
  const columns = view.grid[0]?.length ?? 0;
  if (rows === 0 || columns === 0 || width <= 0 || height <= 0) return;

  const radius = Math.min(width, height) / 2;
  const cellSize = radius / VIEW_RADIUS_CELLS;
  const { x: camX, y: camY, dx, dy } = view.camera;
  const angle = headingUpAngle(dx, dy);

  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.beginPath();
  ctx.arc(width / 2, height / 2, radius, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = "#0d1012";
  ctx.fillRect(0, 0, width, height);

  // centro do canvas → gira → célula em pixels → Player local na origem
  ctx.translate(width / 2, height / 2);
  ctx.rotate(angle);
  ctx.scale(cellSize, cellSize);
  ctx.translate(-camX, -camY);

  // só as células que podem cair no círculo (a diagonal do quadrado cobre qualquer rotação)
  const reach = Math.ceil(VIEW_RADIUS_CELLS * Math.SQRT2) + 1;
  const firstRow = Math.max(0, Math.floor(camY) - reach);
  const lastRow = Math.min(rows - 1, Math.floor(camY) + reach);
  for (let y = firstRow; y <= lastRow; y++) {
    const row = view.grid[y];
    const firstColumn = Math.max(0, Math.floor(camX) - reach);
    const lastColumn = Math.min(row.length - 1, Math.floor(camX) + reach);
    for (let x = firstColumn; x <= lastColumn; x++) {
      const cell = row[x];
      if (cell === " ") continue;
      ctx.fillStyle = cell === "1" ? "#526071" : cell === "D" ? "#d9a354"
        : cell === "O" ? "#426e69" : "#191f2a";
      // 0,02 a mais: com o mapa girado, o antialiasing deixaria fendas entre as células
      ctx.fillRect(x, y, 1.02, 1.02);
      if (cell === "1") {
        // Realce discreto nas paredes, sem acrescentar uma grade ao chão.
        ctx.fillStyle = "#ffffff12";
        ctx.fillRect(x, y, 1, 0.06);
      }
    }
  }

  // O PerspectiveCamera da cena tem FOV vertical de 60°; o cone usa o FOV horizontal.
  const halfAngle = Math.atan(Math.tan(Math.PI / 6) * sceneAspect);
  const cos = Math.cos(halfAngle);
  const sin = Math.sin(halfAngle);
  ctx.beginPath();
  ctx.moveTo(camX, camY);
  ctx.lineTo(camX + (dx * cos + dy * sin) * CONE_LENGTH_CELLS,
    camY + (-dx * sin + dy * cos) * CONE_LENGTH_CELLS);
  ctx.lineTo(camX + (dx * cos - dy * sin) * CONE_LENGTH_CELLS,
    camY + (dx * sin + dy * cos) * CONE_LENGTH_CELLS);
  ctx.closePath();
  const cone = ctx.createRadialGradient(camX, camY, 0, camX, camY, CONE_LENGTH_CELLS);
  cone.addColorStop(0, "#f2c66d55");
  cone.addColorStop(1, "#f2c66d00");
  ctx.fillStyle = cone;
  ctx.fill();

  const edge = VIEW_RADIUS_CELLS - EDGE_INSET_CELLS;
  for (const player of [...view.otherPlayers, view.localPlayer]) {
    const local = player.id === view.localPlayer.id;
    const markerRadius = Math.max(local ? 0.22 : 0.19, (local ? 3 : 2.5) / cellSize);
    const at = local ? { x: player.x, y: player.y, clamped: false }
      : clampToRadar(player.x, player.y, camX, camY, edge);
    if (local && player.alive) {
      ctx.beginPath();
      ctx.arc(at.x, at.y, markerRadius + 2 / cellSize, 0, Math.PI * 2);
      ctx.lineWidth = 1 / cellSize;
      ctx.strokeStyle = "#f2c66d88";
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(at.x, at.y, at.clamped ? markerRadius * 0.8 : markerRadius, 0, Math.PI * 2);
    ctx.fillStyle = !player.alive ? "#88918c" : local
      ? "#f2c66d" : player.connected ? "#75d4d0" : "#8aaca9";
    ctx.fill();
    ctx.lineWidth = 1 / cellSize;
    ctx.strokeStyle = "#0b0a0f";
    ctx.stroke();
  }
  ctx.restore();

  // Norte: losango na borda, que gira junto com o mapa. Sem letra, porque o canvas não tem texto
  const northX = width / 2 + Math.sin(angle) * (radius - 7);
  const northY = height / 2 - Math.cos(angle) * (radius - 7);
  ctx.beginPath();
  ctx.moveTo(northX, northY - 5);
  ctx.lineTo(northX + 4, northY);
  ctx.lineTo(northX, northY + 5);
  ctx.lineTo(northX - 4, northY);
  ctx.closePath();
  ctx.fillStyle = "#f2a03d";
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "#0b0a0f";
  ctx.stroke();
}

export class Minimap {
  private readonly ctx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("minimap_canvas_unavailable");
    this.ctx = ctx;
  }

  resize(): void {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (width <= 0 || height <= 0) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.round(width * ratio);
    const pixelHeight = Math.round(height * ratio);
    if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
      this.canvas.width = pixelWidth;
      this.canvas.height = pixelHeight;
    }
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.width = width;
    this.height = height;
  }

  render(view: ViewState, sceneAspect: number): void {
    if (this.width > 0 && this.height > 0) {
      drawMinimap(this.ctx, view, this.width, this.height, sceneAspect);
    }
  }

  dispose(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}
