import type { BillboardView } from "../src/render/billboards";
import type { Snapshot } from "../src/types";

export type GalleryKind = "enemy" | "boss" | "pickups" | "projectiles" | "players";
export const galleryCamera = { x: 11.5, y: 5.5 };

export function fixtureView(snapshot: Snapshot, grid: readonly string[], userId: number): BillboardView {
  const localPlayer = snapshot.players.find(player => player.id === userId);
  if (!localPlayer) throw new Error("local_player_missing");
  const rows = grid.map(row => [...row]);
  for (const cell of snapshot.grid_delta) rows[cell.y][cell.x] = cell.c;
  return {
    localPlayer,
    otherPlayers: snapshot.players.filter(player => player.id !== userId),
    enemies: snapshot.enemies,
    boss: snapshot.boss,
    projectiles: snapshot.projectiles,
    grid: rows.map(row => row.join("")),
  };
}

// Dados fabricados só para observar os clipes numa área livre da fixture.
// O relógio daqui nunca participa da Simulation ou do envio de Action.
export function galleryView(base: BillboardView, kind: GalleryKind, elapsed: number): BillboardView {
  const view: BillboardView = {
    localPlayer: base.localPlayer, otherPlayers: [], enemies: [], boss: null,
    projectiles: [], grid: base.grid.map(row => row.replace(/[KPMA]/g, "0")),
  };
  const phase = elapsed % 6;
  if (kind === "enemy" && phase < 4.7) {
    view.enemies = [{ id: "demo_enemy", x: 11.5, y: 2.5,
      state: phase < 1.8 ? "alert" : phase < 3.2 ? "attack" : "dying" }];
  }
  if (kind === "boss" && phase < 5.4) {
    view.boss = { x: 11.5, y: 2.5, hp: 60,
      state: phase < 1.5 ? "idle" : phase < 3 ? "alert" : phase < 4.2 ? "attack" : "dying" };
  }
  if (kind === "pickups") {
    const cells = [...view.grid[2]];
    ["K", "P", "M", "A"].forEach((cell, i) => {
      if (phase < 3 + i * 0.5) cells[10 + i] = cell;
    });
    view.grid = view.grid.map((row, y) => y === 2 ? cells.join("") : row);
  }
  if (kind === "projectiles") {
    const travel = elapsed % 1.8;
    if (travel < 1.4) {
      view.projectiles = (["fireball", "bullet"] as const).map((projectileKind, i) => ({
        id: `demo_${projectileKind}`, kind: projectileKind,
        owner: projectileKind === "fireball" ? base.localPlayer.id : null,
        x: 10.9 + i * 1.2, y: 4.2 - Math.min(travel, 1) * 1.7,
        dx: 0, dy: -1, state: travel < 1 ? "moving" : "hit",
      }));
    }
  }
  if (kind === "players") {
    const player = base.otherPlayers[0];
    if (player) view.otherPlayers = [{ ...player, x: 11.5, y: 2.5,
      alive: phase < 5, connected: phase < 3 }];
  }
  return view;
}
