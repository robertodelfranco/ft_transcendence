import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { beforeEach, describe, expect, it } from "vitest";
import { apiFetch } from "../api/client";
import type { LeaderboardRow } from "../api/types";
import { setAccessToken } from "../auth/token";
import i18n from "../i18n";
import leaderboard from "../mocks/fixtures/leaderboard.json";
import { MOCK_PASSWORD } from "../mocks/handlers";
import { server } from "../mocks/server";
import { routes } from "../routes";

// Login no mock e depois "recarrega" na rota pedida. O perfil do mock é pt-BR, e o User é o 7, que
// no exemplo do matches-api.md §3 é o akita, na segunda posição
async function renderAt(path: string) {
  await apiFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "a@b.c", password: MOCK_PASSWORD }),
  });
  setAccessToken(null);
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

const example = leaderboard.items as LeaderboardRow[];

// Serve as linhas e guarda a query de cada pedido, como o servidor a recebeu
function serveLeaderboard(items: LeaderboardRow[] = example) {
  const asked: string[] = [];
  server.use(http.get("/api/leaderboard", ({ request }) => {
    asked.push(new URL(request.url).search);
    return HttpResponse.json({ items });
  }));
  return asked;
}

const optionsOf = (select: HTMLElement) =>
  within(select).getAllByRole("option").map((option) => option.textContent);

beforeEach(async () => {
  localStorage.clear();
  setAccessToken(null);
  await i18n.changeLanguage("en");
});

describe("/leaderboard", () => {
  it("abre em coop por XP: pede assim e mostra posição, jogador e valor", async () => {
    const asked = serveLeaderboard();
    await renderAt("/leaderboard");
    const table = await screen.findByRole("table", { name: "Cooperativo, por XP" });
    expect(asked).toEqual(["?mode=coop&metric=xp&limit=20"]);
    expect(screen.getByRole("heading", { name: "Ranking" })).toBeInTheDocument();
    expect(document.title).toContain("Ranking");

    const rows = within(table).getAllByRole("row");
    expect(within(rows[0]).getAllByRole("columnheader").map((cell) => cell.textContent))
      .toEqual(["Posição", "Jogador", "XP"]);
    expect(within(rows[1]).getByRole("rowheader")).toHaveTextContent("rdel_fra");
    expect(within(rows[1]).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["1", "1.086"]);
    expect(within(rows[2]).getByRole("rowheader")).toHaveTextContent("akita");
    expect(within(rows[2]).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["2", "1.032"]);
  });

  it("marca a própria linha e leva ao perfil de cada um", async () => {
    await renderAt("/leaderboard");
    const table = await screen.findByRole("table");
    const rows = within(table).getAllByRole("row");
    expect(within(rows[2]).getByText("(você)")).toBeInTheDocument();
    expect(within(rows[1]).queryByText("(você)")).not.toBeInTheDocument();
    expect(within(rows[1]).getByRole("link", { name: "rdel_fra" })).toHaveAttribute("href", "/users/9");
    expect(within(rows[2]).getByRole("link", { name: "akita" })).toHaveAttribute("href", "/users/7");
  });

  it("trocar o Mode volta à métrica padrão dele, e a URL acompanha sem criar histórico", async () => {
    const user = userEvent.setup();
    const asked = serveLeaderboard();
    const router = await renderAt("/leaderboard?mode=coop&metric=wins");
    await screen.findByRole("table", { name: "Cooperativo, por Vitórias" });

    await user.selectOptions(screen.getByLabelText("Modo"), "PvP 1x1");
    expect(await screen.findByRole("table", { name: "PvP 1x1, por Elo" })).toBeInTheDocument();
    expect(asked.at(-1)).toBe("?mode=pvp&metric=elo&limit=20");
    expect(screen.getByLabelText("Ordenar por")).toHaveValue("elo");
    expect(router.state.location.search).toBe("?mode=pvp&metric=elo");
    expect(router.state.historyAction).toBe("REPLACE");
  });

  it("cada Mode oferece as métricas que fazem sentido nele", async () => {
    const user = userEvent.setup();
    await renderAt("/leaderboard");
    const metric = await screen.findByLabelText("Ordenar por");
    expect(optionsOf(metric)).toEqual(["XP", "Vitórias", "Kills"]);

    await user.selectOptions(screen.getByLabelText("Modo"), "PvP 1x1");
    await screen.findByRole("table", { name: "PvP 1x1, por Elo" });
    expect(optionsOf(screen.getByLabelText("Ordenar por"))).toEqual(["Elo", "XP", "Vitórias"]);
  });

  it("trocar a métrica mantém o Mode", async () => {
    const user = userEvent.setup();
    const asked = serveLeaderboard();
    await renderAt("/leaderboard");
    await screen.findByRole("table");

    await user.selectOptions(screen.getByLabelText("Ordenar por"), "Vitórias");
    expect(await screen.findByRole("table", { name: "Cooperativo, por Vitórias" })).toBeInTheDocument();
    expect(asked.at(-1)).toBe("?mode=coop&metric=wins&limit=20");
    expect(within(screen.getByRole("table")).getByRole("columnheader", { name: "Vitórias" }))
      .toBeInTheDocument();
  });

  it("a URL escolhe o que aparece", async () => {
    const asked = serveLeaderboard();
    await renderAt("/leaderboard?mode=pvp&metric=wins");
    await screen.findByRole("table", { name: "PvP 1x1, por Vitórias" });
    expect(asked).toEqual(["?mode=pvp&metric=wins&limit=20"]);
    expect(screen.getByLabelText("Modo")).toHaveValue("pvp");
    expect(screen.getByLabelText("Ordenar por")).toHaveValue("wins");
  });

  it.each([
    "mode=meteoro&metric=banana",
    "mode=coop&metric=elo",
    "metric=kills&mode=pvp",
  ])("parâmetro inválido (%s) não vai ao servidor", async (query) => {
    const asked = serveLeaderboard();
    await renderAt(`/leaderboard?${query}`);
    await screen.findByRole("table");
    // o mock responde 422 a mode ou metric fora da lista: um pedido assim viraria alerta
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatch(/^\?mode=(coop|pvp)&metric=(xp|elo)&limit=20$/);
  });

  it("sem ninguém no ranking explica quem aparece nele", async () => {
    serveLeaderboard([]);
    await renderAt("/leaderboard");
    expect(await screen.findByText(
      "Ninguém no ranking ainda: ele lista quem terminou uma partida neste modo.",
    )).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("erro no ranking mostra o aviso, e trocar o filtro tenta de novo", async () => {
    const user = userEvent.setup();
    let calls = 0;
    server.use(http.get("/api/leaderboard", () => {
      calls += 1;
      return calls === 1
        ? HttpResponse.json(
            { error: { code: "internal_error", message: "x", request_id: "test0001", fields: null } },
            { status: 500 },
          )
        : HttpResponse.json({ items: example });
    }));
    await renderAt("/leaderboard");
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Ordenar por"), "Vitórias");
    expect(await screen.findByRole("table", { name: "Cooperativo, por Vitórias" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("trocar de filtro não mostra o ranking anterior enquanto o novo não chega", async () => {
    const user = userEvent.setup();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(http.get("/api/leaderboard", async ({ request }) => {
      if (new URL(request.url).searchParams.get("metric") === "wins")
        await gate;
      return HttpResponse.json({ items: example });
    }));
    await renderAt("/leaderboard");
    await screen.findByRole("table", { name: "Cooperativo, por XP" });

    await user.selectOptions(screen.getByLabelText("Ordenar por"), "Vitórias");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
    await act(async () => release());
    expect(await screen.findByRole("table", { name: "Cooperativo, por Vitórias" })).toBeInTheDocument();
  });
});
