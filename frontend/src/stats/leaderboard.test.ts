import { describe, expect, it } from "vitest";
import { METRICS, parseSelection } from "./leaderboard";

const parse = (query: string) => parseSelection(new URLSearchParams(query));

describe("parseSelection", () => {
  it("sem parâmetros: coop por xp", () => {
    expect(parse("")).toEqual({ mode: "coop", metric: "xp" });
  });

  it("o padrão da métrica depende do Mode: xp no coop, elo no pvp", () => {
    expect(parse("mode=coop")).toEqual({ mode: "coop", metric: "xp" });
    expect(parse("mode=pvp")).toEqual({ mode: "pvp", metric: "elo" });
  });

  it.each(Object.entries(METRICS).flatMap(([mode, metrics]) => metrics.map((metric) => [mode, metric])))(
    "aceita %s com %s",
    (mode, metric) => {
      expect(parse(`mode=${mode}&metric=${metric}`)).toEqual({ mode, metric });
    },
  );

  it.each([
    ["mode=meteoro", { mode: "coop", metric: "xp" }],
    ["mode=PVP", { mode: "coop", metric: "xp" }],
    ["mode=pvp&metric=banana", { mode: "pvp", metric: "elo" }],
    ["mode=coop&metric=elo", { mode: "coop", metric: "xp" }], // o Elo do coop nunca muda
    ["mode=pvp&metric=kills", { mode: "pvp", metric: "elo" }], // e as Kills do pvp são sempre 0
    ["metric=wins", { mode: "coop", metric: "wins" }],
    ["mode=&metric=", { mode: "coop", metric: "xp" }],
  ])("%s volta ao que é válido", (query, expected) => {
    expect(parse(query)).toEqual(expected);
  });
});
