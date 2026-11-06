import { render, screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { beforeEach, describe, expect, it } from "vitest";
import { apiFetch } from "../api/client";
import type { AchievementsResponse } from "../api/types";
import { setAccessToken } from "../auth/token";
import i18n from "../i18n";
import achievements from "../mocks/fixtures/achievements.json";
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

const example = achievements as AchievementsResponse;

// Serve o exemplo com o que `change` mudar, e guarda de quem foi cada pedido
function serveAchievements(change: Partial<AchievementsResponse> = {}) {
  const asked: string[] = [];
  server.use(http.get("/api/users/:userId/achievements", ({ params }) => {
    asked.push(String(params.userId));
    return HttpResponse.json({ ...example, ...change });
  }));
  return asked;
}

const section = () => screen.findByRole("region", { name: "Conquistas" });
const cards = async () => within(await section()).findAllByRole("listitem");
// título e estado de cada cartão: o primeiro e o último parágrafo
const titles = (items: HTMLElement[]) => items.map((item) => item.querySelector("p")?.textContent);
const states = (items: HTMLElement[]) => items.map((item) => item.lastElementChild?.textContent);

const UNLOCKED = /^Desbloqueada em \d+ de outubro de 2026$/; // o dia depende do fuso

beforeEach(async () => {
  localStorage.clear();
  setAccessToken(null);
  await i18n.changeLanguage("en");
});

describe("conquistas no perfil", () => {
  it("o catálogo inteiro, com as desbloqueadas datadas e as outras bloqueadas", async () => {
    await renderProfile(3);
    const items = await cards();
    expect(titles(items)).toEqual([
      "Eu venci!", "Exterminador", "Ensaboado", "Veni, vidi, vici", "Não grita!",
      "Bem-vindo ao Catacombs 42", "Salvo pelo gongo",
    ]);
    const note = states(items);
    for (const index of [0, 1, 2, 5])
      expect(note[index]).toMatch(UNLOCKED);
    for (const index of [3, 4, 6])
      expect(note[index]).toBe("Bloqueada");
    expect(within(await section()).getByText("4 de 7 desbloqueadas")).toBeInTheDocument();
  });

  it("cada conquista traz a descrição traduzida", async () => {
    await renderProfile(3);
    const items = await cards();
    expect(within(items[0]).getByText("Vença uma partida cooperativa.")).toBeInTheDocument();
    expect(within(items[4]).getByText("Faça 5 ou mais Frags em uma única partida PvP."))
      .toBeInTheDocument();
  });

  it("a ordem é a do catálogo, não a do desbloqueio", async () => {
    serveAchievements({ unlocked: [...example.unlocked].reverse() });
    await renderProfile(3);
    expect(titles(await cards())[0]).toBe("Eu venci!");
    expect(titles(await cards())[5]).toBe("Bem-vindo ao Catacombs 42");
  });

  it("sem nenhuma desbloqueada", async () => {
    serveAchievements({ unlocked: [] });
    await renderProfile(3);
    expect(states(await cards())).toEqual(Array(7).fill("Bloqueada"));
    expect(within(await section()).getByText("0 de 7 desbloqueadas")).toBeInTheDocument();
  });

  it("code sem tradução mostra o próprio code, sem descrição nem chave crua", async () => {
    serveAchievements({ catalog: [...example.catalog, { code: "meteoro", mode: null }] });
    await renderProfile(3);
    const items = await cards();
    expect(items).toHaveLength(8);
    const unknown = items[7];
    expect(within(unknown).getByText("meteoro")).toBeInTheDocument();
    expect(unknown.querySelectorAll("p")).toHaveLength(2); // o code e o estado
    expect(screen.queryByText(/achievements\./)).not.toBeInTheDocument();
  });

  it("desbloqueio fora do catálogo não entra na conta", async () => {
    serveAchievements({ unlocked: [
      ...example.unlocked, { code: "meteoro", unlocked_at: "2026-10-05T10:00:00Z", match_id: 20 },
    ] });
    await renderProfile(3);
    await cards();
    expect(within(await section()).getByText("4 de 7 desbloqueadas")).toBeInTheDocument();
  });

  it("pede as conquistas do User do perfil, não as de quem está logado", async () => {
    const asked = serveAchievements();
    await renderProfile(3);
    await cards();
    expect(asked).toEqual(["3"]);
  });

  it("erro nas conquistas não derruba o perfil", async () => {
    server.use(http.get("/api/users/:userId/achievements", () => HttpResponse.json(
      { error: { code: "internal_error", message: "x", request_id: "test0001", fields: null } },
      { status: 500 },
    )));
    await renderProfile(3);
    expect(await within(await section()).findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "roberto" })).toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "Histórico de partidas" })).toBeInTheDocument();
  });
});
