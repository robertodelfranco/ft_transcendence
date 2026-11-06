import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { beforeEach, describe, expect, it } from "vitest";
import { apiFetch } from "../api/client";
import type { MatchHistoryItem, Page } from "../api/types";
import { setAccessToken } from "../auth/token";
import i18n from "../i18n";
import matchHistory from "../mocks/fixtures/matchHistory.json";
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

const example = matchHistory as Page<MatchHistoryItem>;
const pvpWin = example.items[0];

const coopWith = (...names: string[]): MatchHistoryItem => ({
  ...pvpWin, match_id: 20, mode: "coop", map: "dungeon_map", result: "loss", reason: "all_dead",
  others: names.map((username, index) => ({
    user_id: 30 + index, username, avatar_url: "/media/avatars/default.png", won: false,
  })),
});

// Responde o histórico pela página pedida e guarda o que chegou: de quem, página e per_page
function serveHistory(total: number, itemsOf: (page: number) => MatchHistoryItem[]) {
  const asked: string[][] = [];
  server.use(http.get("/api/users/:userId/matches", ({ params, request }) => {
    const query = new URL(request.url).searchParams;
    asked.push([String(params.userId), query.get("page") ?? "", query.get("per_page") ?? ""]);
    const page = Number(query.get("page"));
    return HttpResponse.json({ items: itemsOf(page), page, per_page: 10, total });
  }));
  return asked;
}

const history = () => screen.findByRole("region", { name: "Histórico de partidas" });

beforeEach(async () => {
  localStorage.clear();
  setAccessToken(null);
  await i18n.changeLanguage("en");
});

describe("histórico no perfil", () => {
  it("mostra resultado, Mode, Map, data, oponente e o link da partida", async () => {
    await renderProfile(3);
    const section = within(await history());
    const row = within(await section.findByRole("listitem"));
    expect(row.getByText("Vitória")).toBeInTheDocument();
    expect(row.getByText("PvP 1x1")).toBeInTheDocument();
    expect(row.getByText("Anel")).toBeInTheDocument();
    expect(row.getByText(/^4 de out\. de 2026/)).toHaveAttribute("dateTime", "2026-10-04T18:22:35Z");
    expect(row.getByText("02:35")).toBeInTheDocument();
    expect(row.getByText("Contra rdel_fra")).toBeInTheDocument();
    expect(row.getByRole("link", { name: "Ver partida #13" })).toHaveAttribute("href", "/matches/13");
    // 37 partidas, 20 por página na resposta do exemplo: as páginas vêm do per_page devolvido
    expect(section.getByText("Página 1 de 2")).toBeInTheDocument();
  });

  it("Map sem tradução mostra o nome do arquivo", async () => {
    serveHistory(1, () => [{ ...pvpWin, map: "mapa_novo" }]);
    await renderProfile(3);
    const row = within(await within(await history()).findByRole("listitem"));
    expect(row.getByText("mapa_novo")).toBeInTheDocument();
  });

  it("pede o histórico do User do perfil, não o de quem está logado", async () => {
    const asked = serveHistory(1, () => [pvpWin]);
    await renderProfile(3);
    await within(await history()).findByRole("listitem");
    expect(asked).toEqual([["3", "1", "10"]]);
  });

  it("coop: companheiros em lista, e partida solo", async () => {
    serveHistory(2, () => [coopWith("rdel_fra", "caio"), coopWith()]);
    await renderProfile(7);
    const rows = await within(await history()).findAllByRole("listitem");
    expect(within(rows[0]).getByText("Derrota")).toBeInTheDocument();
    expect(within(rows[0]).getByText("Com rdel_fra e caio")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Sozinho")).toBeInTheDocument();
  });

  it("sem partidas", async () => {
    serveHistory(0, () => []);
    await renderProfile(7);
    expect(await within(await history()).findByText("Nenhuma partida terminada ainda."))
      .toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Páginas do histórico" })).not.toBeInTheDocument();
  });

  it("pagina com Anterior e Próxima, pelo total da resposta", async () => {
    const user = userEvent.setup();
    const asked = serveHistory(25, (page) => [{ ...pvpWin, match_id: page }]);
    await renderProfile(7);
    const pages = await screen.findByRole("navigation", { name: "Páginas do histórico" });
    expect(within(pages).getByText("Página 1 de 3")).toBeInTheDocument();
    expect(within(pages).getByRole("button", { name: "Anterior" })).toBeDisabled();

    await user.click(within(pages).getByRole("button", { name: "Próxima" }));
    expect(await screen.findByRole("link", { name: "Ver partida #2" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Ver partida #1" })).not.toBeInTheDocument();
    expect(screen.getByText("Página 2 de 3")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Próxima" }));
    expect(await screen.findByText("Página 3 de 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Próxima" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Anterior" }));
    expect(await screen.findByText("Página 2 de 3")).toBeInTheDocument();
    expect(asked.map(([, page]) => page)).toEqual(["1", "2", "3", "2"]);
  });

  it("erro no histórico não derruba o perfil", async () => {
    server.use(http.get("/api/users/:userId/matches", () => HttpResponse.json(
      { error: { code: "internal_error", message: "x", request_id: "test0001", fields: null } },
      { status: 500 },
    )));
    await renderProfile(3);
    expect(await within(await history()).findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "roberto" })).toBeInTheDocument();
  });

  it("trocar de perfil volta para a primeira página", async () => {
    const user = userEvent.setup();
    const asked = serveHistory(25, (page) => [{ ...pvpWin, match_id: page }]);
    const router = await renderProfile(7);
    await user.click(await screen.findByRole("button", { name: "Próxima" }));
    await screen.findByText("Página 2 de 3");

    await act(() => router.navigate("/users/3"));
    expect(await screen.findByText("Página 1 de 3")).toBeInTheDocument();
    expect(asked.at(-1)).toEqual(["3", "1", "10"]);
  });
});
