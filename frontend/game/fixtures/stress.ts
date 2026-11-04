import type { ViewState } from "../src/render/renderer";
import type { PlayerSnapshot } from "../src/types";

// Cena sintética exclusiva da demo: não representa uma Room nem executa Simulation.
export const stressGrid = Array.from({ length: 18 }, (_, y) => {
  if (y === 0 || y === 17) return "1".repeat(24);
  const row = [...`1${"0".repeat(22)}1`];
  if (y === 5 || y === 12) {
    row[3] = "T";
    row[20] = "T";
  }
  return row.join("");
});

export function createStressView(player: PlayerSnapshot): ViewState {
  const localPlayer = { ...player, x: 12, y: 16, dx: 0, dy: -1, alive: true, connected: true };
  return {
    localPlayer,
    otherPlayers: Array.from({ length: 4 }, (_, i) => ({
      ...localPlayer, id: -i - 1, name: `stress_${i}`, x: 9 + i * 2, y: 8,
    })),
    enemies: Array.from({ length: 20 }, (_, i) => ({
      id: `stress_enemy_${i}`, x: 7 + (i % 5) * 2.5, y: 3 + Math.floor(i / 5), state: "alert",
    })),
    boss: null,
    projectiles: Array.from({ length: 10 }, (_, i) => ({
      id: `stress_projectile_${i}`, kind: i % 2 === 0 ? "fireball" : "bullet",
      owner: i % 2 === 0 ? localPlayer.id : null,
      x: 8 + (i % 5) * 2, y: 10 + Math.floor(i / 5),
      dx: 0, dy: -1, state: "moving",
    })),
    doors: [], grid: stressGrid,
    camera: { x: 12, y: 16, dx: 0, dy: -1, pitch: 0 },
  };
}

export function animateStressView(view: ViewState, elapsed: number): void {
  for (let i = 0; i < view.enemies.length; i++) {
    const enemy = view.enemies[i];
    enemy.x = 7 + (i % 5) * 2.5 + Math.sin(elapsed + i) * 0.2;
    const phase = (elapsed + i * 0.2) % 6;
    enemy.state = phase < 2 ? "alert" : phase < 4 ? "attack" : "dying";
  }
  for (let i = 0; i < view.projectiles.length; i++) {
    const projectile = view.projectiles[i];
    const phase = (elapsed + i * 0.15) % 2;
    projectile.y = 12 - Math.min(phase, 1.6) * 2;
    projectile.state = phase < 1.6 ? "moving" : "hit";
  }
}
