import { expect, test } from "vitest";
import example from "../../fixtures/snapshot.example.json";
import type { PlayerSnapshot, RoomOptions, Snapshot } from "../types";
import { applyGridDelta, buildHud, buildViewState, createGridTracker, emptyHud } from "./viewstate";

const BASE = ["1111", "1KD1", "1111"];
const OPTIONS: RoomOptions = { theme: "dungeon", start_hp: 10,
  pickups: { potion: true, mana: true, armor: true } };

const player = (id: number, extra: Partial<PlayerSnapshot> = {}): PlayerSnapshot => ({
  id, name: `p${id}`, x: id + 0.5, y: 1.5, dx: 0, dy: -1, hp: 10, mana: 100, armor: 0, keys: 0,
  alive: true, connected: true, ...extra });

const snapshot = (players: PlayerSnapshot[], extra: Partial<Snapshot> = {}): Snapshot => ({
  tick: 2, last_input_seq: 0, players, enemies: [], boss: null, projectiles: [], doors: [],
  grid_delta: [], scoreboard: null, ...extra });

test("grid_delta changes only the listed cells and keeps the base", () => {
  const grid = applyGridDelta(BASE, [{ x: 1, y: 1, c: "0" }, { x: 2, y: 1, c: "O" }]);
  expect(grid).toEqual(["1111", "10O1", "1111"]);
  expect(BASE).toEqual(["1111", "1KD1", "1111"]);
});

test("applying the same delta twice gives the same Grid", () => {
  const delta = [{ x: 2, y: 1, c: "O" }];
  expect(applyGridDelta(applyGridDelta(BASE, delta), delta)).toEqual(applyGridDelta(BASE, delta));
});

test("a cell outside the Grid is ignored", () => {
  expect(applyGridDelta(BASE, [{ x: 9, y: 9, c: "0" }])).toEqual(BASE);
});

test("the tracker keeps the same array while the delta does not change", () => {
  const track = createGridTracker(BASE);
  expect(track([])).toBe(BASE);
  const opened = track([{ x: 2, y: 1, c: "O" }]);
  expect(opened).toEqual(["1111", "1KO1", "1111"]);
  expect(track([{ x: 2, y: 1, c: "O" }])).toBe(opened); // Snapshot novo, mesmo conteúdo
  expect(track([{ x: 2, y: 1, c: "O" }, { x: 1, y: 1, c: "0" }])).toEqual(["1111", "10O1", "1111"]);
});

test("the tracker notices a cell that changed without the delta growing", () => {
  const track = createGridTracker(BASE);
  track([{ x: 1, y: 1, c: "0" }]);
  expect(track([{ x: 1, y: 1, c: "K" }])).toEqual(BASE);
});

test("the example Snapshot builds a ViewState with the local Player apart", () => {
  const view = buildViewState(example.snapshot as Snapshot, example.welcome.map.grid,
    example.welcome.user_id, "coop");
  expect(view?.localPlayer.id).toBe(7);
  expect(view?.otherPlayers.map((other) => other.id)).not.toContain(7);
  expect(view?.camera).toMatchObject({ x: view?.localPlayer.x, y: view?.localPlayer.y, pitch: 0 });
});

test("without the local Player there is no ViewState", () => {
  expect(buildViewState(snapshot([player(2)]), BASE, 1, "coop")).toBeNull();
});

test("dead in coop, the camera follows a living teammate", () => {
  const view = buildViewState(snapshot([player(1, { alive: false }), player(2, { alive: false }),
    player(3)]), BASE, 1, "coop");
  expect(view?.camera.x).toBe(3.5);
});

test("dead in pvp, the camera stays on the own body", () => {
  const view = buildViewState(snapshot([player(1, { alive: false }), player(2)]), BASE, 1, "pvp");
  expect(view?.camera.x).toBe(1.5);
});

test("the HUD takes the local numbers and the caps from the Room", () => {
  const hud = buildHud(snapshot([player(1, { hp: 4, mana: 30, armor: 2, keys: 1 }), player(2)]),
    { userId: 1, mode: "coop", options: OPTIONS }, [], "running");
  expect(hud).toMatchObject({ hp: 4, maxHp: 10, mana: 30, maxMana: 100, armor: 2, keys: 1,
    alive: true, ping: null, scoreboard: null, status: "running" });
  expect(hud.players).toEqual([
    { id: 1, name: "p1", hp: 4, alive: true, connected: true },
    { id: 2, name: "p2", hp: 10, alive: true, connected: true },
  ]);
});

test("the pvp scoreboard turns time_left_s into timeLeftS", () => {
  const scoreboard = { players: [{ id: 2, frags: 3 }, { id: 1, frags: 1 }], time_left_s: 90 };
  const hud = buildHud(snapshot([player(1), player(2)], { scoreboard }),
    { userId: 1, mode: "pvp", options: OPTIONS }, [], "running");
  expect(hud.scoreboard).toEqual({ players: scoreboard.players, timeLeftS: 90 });
});

test("the empty HUD carries the error code only when there is one", () => {
  expect(emptyHud("connecting")).not.toHaveProperty("error");
  expect(emptyHud("error", "room_not_found").error).toBe("room_not_found");
});
