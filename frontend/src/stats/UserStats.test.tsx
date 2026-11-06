import { render, screen, within, type BoundFunctions, type queries } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { beforeEach, describe, expect, it } from "vitest";
import { apiFetch } from "../api/client";
import type { PlayerStats, UserStats as UserStatsData } from "../api/types";
import { setAccessToken } from "../auth/token";
import i18n from "../i18n";
import userStats from "../mocks/fixtures/userStats.json";
import { MOCK_PASSWORD } from "../mocks/handlers";
import { server } from "../mocks/server";
import { routes } from "../routes";

// Login no mock e depois "recarrega" no perfil pedido. O perfil do mock é pt-BR
async function renderProfile(userId: number) {
  await apiFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "a@b.c", password: MOCK_PASSWORD }),
  });
  setAccessToken(null);
  const router = createMemoryRouter(routes, { initialEntries: [`/users/${userId}`] });
  render(<RouterProvider router={router} />);
  return router;
}

const example = userStats as UserStatsData;

// Serve estatísticas com o que `change` mudar no coop, e guarda de quem foi cada pedido
function serveStats(change: Partial<PlayerStats> = {}) {
  const asked: string[] = [];
  server.use(http.get("/api/users/:userId/stats", ({ params }) => {
    asked.push(String(params.userId));
    return HttpResponse.json({ ...example, coop: { ...example.coop, ...change } });
  }));
  return asked;
}

const stats = () => screen.findByRole("region", { name: "Estatísticas" });
const card = async (name: string) => within(await within(await stats()).findByRole("region", { name }));
const rowsOf = (scope: BoundFunctions<typeof queries>) =>
  scope.getAllByText(/./, { selector: "dt" }).map((term) => [term.textContent, term.nextElementSibling?.textContent]);

beforeEach(async () => {
  localStorage.clear();
  setAccessToken(null);
  await i18n.changeLanguage("en");
});

describe("estatísticas no perfil", () => {
  it("coop: nível, progresso e os números do Mode, com Kills e sem Elo", async () => {
    await renderProfile(3);
    const coop = await card("Cooperativo");
    expect(coop.getByText("Nível 5")).toBeInTheDocument();
    expect(coop.getByText("1.840 XP")).toBeInTheDocument();
    expect(coop.getByText("Faltam 660 XP para o nível 6")).toBeInTheDocument();
    expect(rowsOf(coop)).toEqual([
      ["Partidas", "12"], ["Vitórias", "8"], ["Derrotas", "4"], ["Empates", "0"],
      ["Aproveitamento", "67%"], ["Kills", "96"], ["Mortes", "5"], ["Tempo de jogo", "1 h 20 min"],
    ]);
  });

  it("pvp: Elo no topo e Frags no lugar de Kills", async () => {
    await renderProfile(3);
    const pvp = await card("PvP 1x1");
    expect(pvp.getByText("Nível 3")).toBeInTheDocument();
    expect(pvp.getByText("Faltam 490 XP para o nível 4")).toBeInTheDocument();
    expect(rowsOf(pvp)).toEqual([
      ["Elo", "1.032"], ["Partidas", "5"], ["Vitórias", "3"], ["Derrotas", "2"], ["Empates", "0"],
      ["Aproveitamento", "60%"], ["Frags", "19"], ["Mortes", "14"], ["Tempo de jogo", "12 min"],
    ]);
  });

  it("a barra cobre só o level atual, do XP em que ele começou até o do próximo", async () => {
    await renderProfile(3);
    const coop = await card("Cooperativo");
    const bar = coop.getByRole("progressbar", { name: "Progresso até o próximo nível" });
    expect(bar).toHaveAttribute("value", "240"); // 1840 - 1600, onde o level 5 começou
    expect(bar).toHaveAttribute("max", "900"); // de 1600 a 2500, sem fórmula no front
    const pvp = await card("PvP 1x1");
    const pvpBar = pvp.getByRole("progressbar", { name: "Progresso até o próximo nível" });
    expect(pvpBar).toHaveAttribute("value", "10"); // 410 - 400
    expect(pvpBar).toHaveAttribute("max", "500"); // de 400 a 900
  });

  it.each([
    // xp, level, falta, início do level, value e max esperados
    [2499, 5, 1, 1600, "899", "900"], // a última unidade do level 5: quase cheia
    [2500, 6, 1100, 2500, "0", "1100"], // a primeira do level 6: vazia, não volta a 70 %
    [0, 1, 100, 0, "0", "100"], // quem nunca jogou
  ])("barra com %i XP no level %i", async (xp, level, toNext, start, value, max) => {
    serveStats({ xp, level, xp_to_next_level: toNext, xp_level_start: start });
    await renderProfile(3);
    const bar = (await card("Cooperativo")).getByRole("progressbar");
    expect(bar).toHaveAttribute("value", value);
    expect(bar).toHaveAttribute("max", max);
  });

  it("pede as estatísticas do User do perfil, não as de quem está logado", async () => {
    const asked = serveStats();
    await renderProfile(3);
    await stats();
    await card("Cooperativo");
    expect(asked).toEqual(["3"]);
  });

  it("sem partidas, o aproveitamento não vira 0 %", async () => {
    serveStats({ matches_played: 0, wins: 0, losses: 0, kills: 0, deaths: 0, playtime_s: 0,
      xp: 0, level: 1, win_rate: 0, xp_to_next_level: 100 });
    await renderProfile(3);
    const coop = await card("Cooperativo");
    expect(coop.getByText("Nível 1")).toBeInTheDocument();
    expect(coop.getByText("Faltam 100 XP para o nível 2")).toBeInTheDocument();
    expect(rowsOf(coop)).toContainEqual(["Aproveitamento", "—"]);
    expect(rowsOf(coop)).toContainEqual(["Tempo de jogo", "0 min"]);
  });

  it.each([
    [59, "0 min"], [60, "1 min"], [3599, "59 min"], [3600, "1 h 0 min"], [7260, "2 h 1 min"],
  ])("tempo de jogo: %i s vira %s", async (seconds, text) => {
    serveStats({ playtime_s: seconds });
    await renderProfile(3);
    expect(rowsOf(await card("Cooperativo"))).toContainEqual(["Tempo de jogo", text]);
  });

  it("erro nas estatísticas não derruba o perfil nem o histórico", async () => {
    server.use(http.get("/api/users/:userId/stats", () => HttpResponse.json(
      { error: { code: "internal_error", message: "x", request_id: "test0001", fields: null } },
      { status: 500 },
    )));
    await renderProfile(3);
    expect(await within(await stats()).findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "roberto" })).toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "Histórico de partidas" })).toBeInTheDocument();
  });
});
