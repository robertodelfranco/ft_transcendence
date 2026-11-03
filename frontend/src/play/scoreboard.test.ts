import { describe, expect, it } from "vitest";
import { formatClock, recentKills } from "./scoreboard";

describe("formatClock", () => {
  it.each([
    [125, "02:05"],
    [600, "10:00"],
    [59.2, "01:00"], // arredonda para cima: 59,2 s ainda é o minuto 1
    [0.4, "00:01"],
    [0, "00:00"],
    [-3, "00:00"], // Snapshot atrasado não mostra tempo negativo
  ])("%s s → %s", (seconds, clock) => {
    expect(formatClock(seconds)).toBe(clock);
  });
});

describe("recentKills", () => {
  const kill = (tick: number) => ({ by: 7, victim: 9, tick });

  it("a mais recente primeiro, no máximo cinco", () => {
    const ticks = recentKills([1, 2, 3, 4, 5, 6].map(kill)).map((entry) => entry.tick);
    expect(ticks).toEqual([6, 5, 4, 3, 2]);
  });

  it("não muda a lista recebida do jogo", () => {
    const feed = [kill(1), kill(2)];
    recentKills(feed);
    expect(feed.map((entry) => entry.tick)).toEqual([1, 2]);
  });
});
