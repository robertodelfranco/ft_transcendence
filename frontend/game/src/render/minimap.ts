import type { ViewState } from "./renderer";

const CONE_LENGTH_CELLS = 3;

// O Grid usa x para colunas e y para linhas, como a cena 3D: norte é y menor.
export function drawMinimap(ctx: CanvasRenderingContext2D, view: ViewState,
  width: number, height: number, sceneAspect: number): void {
  const rows = view.grid.length;
  const columns = view.grid[0]?.length ?? 0;
  if (rows === 0 || columns === 0 || width <= 0 || height <= 0) return;

  const padding = Math.min(8, width / 8, height / 8);
  const cellSize = Math.min((width - padding * 2) / columns, (height - padding * 2) / rows);
  const offsetX = (width - columns * cellSize) / 2;
  const offsetY = (height - rows * cellSize) / 2;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#0b0a0f";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#f2a03d18";
  ctx.lineWidth = 1;
  ctx.strokeRect(3.5, 3.5, Math.max(0, width - 7), Math.max(0, height - 7));
  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(cellSize, cellSize);

  view.grid.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const cell = row[x];
      if (cell === " ") continue;
      ctx.fillStyle = cell === "1" ? "#526071" : cell === "D" ? "#d9a354"
        : cell === "O" ? "#426e69" : "#191f2a";
      ctx.fillRect(x, y, 1, 1);
      if (cell === "1") {
        // Realce discreto nas paredes, sem acrescentar uma grade ao chão.
        ctx.fillStyle = "#ffffff12";
        ctx.fillRect(x, y, 1, 0.06);
      }
    }
  });

  const { x, y, dx, dy } = view.camera;
  // O PerspectiveCamera da cena tem FOV vertical de 60°; o cone usa o FOV horizontal.
  const halfAngle = Math.atan(Math.tan(Math.PI / 6) * sceneAspect);
  const cos = Math.cos(halfAngle);
  const sin = Math.sin(halfAngle);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + (dx * cos + dy * sin) * CONE_LENGTH_CELLS,
    y + (-dx * sin + dy * cos) * CONE_LENGTH_CELLS);
  ctx.lineTo(x + (dx * cos - dy * sin) * CONE_LENGTH_CELLS,
    y + (dx * sin + dy * cos) * CONE_LENGTH_CELLS);
  ctx.closePath();
  const cone = ctx.createRadialGradient(x, y, 0, x, y, CONE_LENGTH_CELLS);
  cone.addColorStop(0, "#f2c66d55");
  cone.addColorStop(1, "#f2c66d00");
  ctx.fillStyle = cone;
  ctx.fill();

  for (const player of [...view.otherPlayers, view.localPlayer]) {
    const local = player.id === view.localPlayer.id;
    const radius = Math.max(local ? 0.22 : 0.19, (local ? 3 : 2.5) / cellSize);
    if (local && player.alive) {
      ctx.beginPath();
      ctx.arc(player.x, player.y, radius + 2 / cellSize, 0, Math.PI * 2);
      ctx.lineWidth = 1 / cellSize;
      ctx.strokeStyle = "#f2c66d88";
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(player.x, player.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = !player.alive ? "#88918c" : local
      ? "#f2c66d" : player.connected ? "#75d4d0" : "#8aaca9";
    ctx.fill();
    ctx.lineWidth = 1 / cellSize;
    ctx.strokeStyle = "#0b0a0f";
    ctx.stroke();
  }
  ctx.restore();
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
