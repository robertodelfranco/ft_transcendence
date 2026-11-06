import { render, screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../api/client";
import type { AchievementsResponse, MatchDetail } from "../api/types";
import { setAccessToken } from "../auth/token";
import i18n from "../i18n";
import achievements from "../mocks/fixtures/achievements.json";
import matchResult from "../mocks/fixtures/matchResult.json";
import { MOCK_PASSWORD } from "../mocks/handlers";
import { server } from "../mocks/server";
import { routes } from "../routes";

// Login no mock e depois "recarrega" na rota pedida. O perfil do mock é pt-BR, e o User é o 7,
// que no exemplo do matches-api.md §3 aparece como akita
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

const coop = matchResult as MatchDetail;

// O Match 14 como pvp: o 7 perde por 3 a 5 e o result da Room continua "win" (matches-api.md §2.4)
const pvp: MatchDetail = {
  ...coop, mode: "pvp", map: "pvp_ring", reason: "frag_limit",
  options: { ...coop.options, frag_limit: 5, time_limit_s: 180 },
  players: [
    { ...coop.players[0], won: false, kills: 0, frags: 3, elo_before: 1000, elo_after: 984 },
    { ...coop.players[1], won: true, kills: 0, frags: 5, elo_before: 1000, elo_after: 1016 },
  ],
};

function serve(detail: MatchDetail) {
  server.use(http.get("/api/matches/14/result", () => HttpResponse.json(detail)));
}

// a linha da tabela de um Player, pelo nome
function rowOf(username: string) {
  return screen.getByRole("row", { name: new RegExp(`^${username}`) });
}

beforeEach(async () => {
  localStorage.clear();
  setAccessToken(null);
  await i18n.changeLanguage("en");
});

describe("/matches/:matchId", () => {
  it("coop: desfecho, motivo, detalhes e os números de cada Player", async () => {
    await renderAt("/matches/14");
    expect(await screen.findByRole("heading", { name: "Partida #14" })).toBeInTheDocument();
    expect(screen.getByText("Vitória!")).toBeInTheDocument();
    expect(screen.getByText("O Boss foi derrotado.")).toBeInTheDocument();
    expect(screen.getByText("Cooperativo")).toBeInTheDocument();
    expect(screen.getByText("Masmorra")).toBeInTheDocument();
    expect(screen.getByText("05:00")).toBeInTheDocument();
    expect(screen.getByText(/^4 de outubro de 2026/)).toBeInTheDocument(); // a hora depende do fuso
    expect(document.title).toContain("Resultado da partida");

    expect(screen.getByRole("columnheader", { name: "Kills" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Elo" })).not.toBeInTheDocument();
    const me = within(rowOf("akita"));
    expect(me.getByText("(você)")).toBeInTheDocument();
    expect(me.getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["5", "0", "14", "6", "+145"]);
    expect(within(rowOf("rdel_fra")).getAllByRole("cell").map((cell) => cell.textContent))
      .toEqual(["2", "1", "8", "12", "+130"]);
    // coop: ninguém marcado como vencedor, a equipe ganha junta
    expect(screen.queryByText("venceu")).not.toBeInTheDocument();
  });

  it("pvp: quem perdeu vê Derrota, mesmo com o result win da Room", async () => {
    serve(pvp);
    await renderAt("/matches/14");
    expect(await screen.findByText("Derrota")).toBeInTheDocument();
    expect(screen.queryByText("Vitória!")).not.toBeInTheDocument();
    expect(screen.getByText("Um jogador chegou ao limite de Frags.")).toBeInTheDocument();
    expect(screen.getByText("PvP 1x1")).toBeInTheDocument();
    expect(screen.getByText("Anel")).toBeInTheDocument();

    expect(screen.getByRole("columnheader", { name: "Frags" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Kills" })).not.toBeInTheDocument();
    const me = within(rowOf("akita"));
    expect(me.getAllByRole("cell").at(0)).toHaveTextContent("3");
    expect(me.getAllByRole("cell").at(-1)).toHaveTextContent("984 (-16)");
    expect(me.queryByText("venceu")).not.toBeInTheDocument();
    const rival = within(rowOf("rdel_fra"));
    expect(rival.getByText("venceu")).toBeInTheDocument();
    expect(rival.getAllByRole("cell").at(-1)).toHaveTextContent("1016 (+16)");
  });

  // até a F5.5 (#157), o backend grava o pvp sem Elo e com XP 0: é o que a tela recebe hoje
  it("pvp sem Elo gravado mostra traço no lugar do número", async () => {
    serve({ ...pvp, players: pvp.players.map((player) =>
      ({ ...player, xp_gained: 0, elo_before: null, elo_after: null })) });
    await renderAt("/matches/14");
    await screen.findByText("Derrota");
    const cells = within(rowOf("akita")).getAllByRole("cell");
    expect(cells.slice(-2).map((cell) => cell.textContent)).toEqual(["0", "—"]);
  });

  it("empate", async () => {
    serve({ ...pvp, result: "draw", reason: "time_limit",
      players: pvp.players.map((player) => ({ ...player, won: false })) });
    await renderAt("/matches/14");
    expect(await screen.findByText("Empate")).toBeInTheDocument();
    expect(screen.getByText("O tempo acabou.")).toBeInTheDocument();
    expect(screen.queryByText("venceu")).not.toBeInTheDocument();
  });

  it("partida de outra pessoa: sem desfecho pessoal, com os Players e o link do perfil", async () => {
    serve({ ...coop, players: [coop.players[1]] });
    await renderAt("/matches/14");
    const link = await screen.findByRole("link", { name: "rdel_fra" });
    expect(link).toHaveAttribute("href", "/users/9");
    expect(screen.queryByText("Vitória!")).not.toBeInTheDocument();
    expect(screen.queryByText("(você)")).not.toBeInTheDocument();
    expect(screen.getByText("O Boss foi derrotado.")).toBeInTheDocument();
  });

  it("quem saiu antes do fim aparece marcado", async () => {
    serve({ ...coop, players: [coop.players[0], { ...coop.players[1], disconnected_at_end: true }] });
    await renderAt("/matches/14");
    await screen.findByText("Vitória!");
    expect(within(rowOf("rdel_fra")).getByText("desconectado no fim")).toBeInTheDocument();
    expect(within(rowOf("akita")).queryByText("desconectado no fim")).not.toBeInTheDocument();
  });

  it("Match que não existe", async () => {
    await renderAt("/matches/999");
    expect(await screen.findByText("Partida não encontrada.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Voltar ao lobby" })).toHaveAttribute("href", "/lobby");
  });

  it("Match abortado", async () => {
    server.use(http.get("/api/matches/14/result", () => HttpResponse.json(
      { error: { code: "match_aborted", message: "aborted", request_id: "test0001", fields: null } },
      { status: 409 },
    )));
    await renderAt("/matches/14");
    expect(await screen.findByText("Esta partida foi interrompida e não tem resultado.")).toBeInTheDocument();
  });

  it.each(["abc", "0", "0x10", "1e1", "99999999999999999999"])(
    "id inválido (%s) não vai ao servidor",
    async (param) => {
      let requested = false;
      // não devolver nada passa o pedido adiante: aqui só registra que ele saiu
      server.use(http.get("/api/matches/:matchId/result", () => {
        requested = true;
      }));
      await renderAt(`/matches/${param}`);
      expect(await screen.findByText("Partida não encontrada.")).toBeInTheDocument();
      expect(requested).toBe(false);
    },
  );
});

describe("conquistas da partida", () => {
  const example = achievements as AchievementsResponse;
  const OTHER_MATCH = { unlocked_at: "2026-10-01T10:00:00Z", match_id: 12 };

  // guarda de quem foi cada pedido de conquistas
  function serveAchievements(unlocked: AchievementsResponse["unlocked"]) {
    const asked: string[] = [];
    server.use(http.get("/api/users/:userId/achievements", ({ params }) => {
      asked.push(String(params.userId));
      return HttpResponse.json({ ...example, unlocked });
    }));
    return asked;
  }

  // tempo para a resposta de conquistas chegar e a tela se redesenhar
  const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

  it("mostra só as desbloqueadas nesta partida, de quem está logado", async () => {
    const asked = serveAchievements([
      ...example.unlocked,
      { code: "pvp_first_win", ...OTHER_MATCH }, // de outra partida
      { code: "pvp_five_frags", unlocked_at: "2026-10-01T10:00:00Z", match_id: null }, // o Match não existe mais
    ]);
    await renderAt("/matches/14");
    const section = await screen.findByRole("region", { name: "Conquistas desbloqueadas nesta partida" });
    const names = within(section).getAllByRole("listitem").map((item) => item.querySelector("p")?.textContent);
    expect(names).toEqual(["Eu venci!", "Exterminador", "Ensaboado", "Bem-vindo ao Catacombs 42"]);
    expect(within(section).getByText("Vença uma partida cooperativa sem morrer.")).toBeInTheDocument();
    expect(asked).toEqual(["7"]);
  });

  it("sem conquista nesta partida, a seção não aparece", async () => {
    const asked = serveAchievements([{ code: "pvp_first_win", ...OTHER_MATCH }]);
    await renderAt("/matches/14");
    await screen.findByText("Vitória!");
    await vi.waitFor(() => expect(asked).toHaveLength(1));
    await settle();
    expect(screen.queryByText("Conquistas desbloqueadas nesta partida")).not.toBeInTheDocument();
  });

  it("partida de outra pessoa não pede conquistas", async () => {
    const asked = serveAchievements(example.unlocked);
    serve({ ...coop, players: [coop.players[1]] });
    await renderAt("/matches/14");
    await screen.findByRole("link", { name: "rdel_fra" });
    await settle();
    expect(asked).toEqual([]);
    expect(screen.queryByText("Conquistas desbloqueadas nesta partida")).not.toBeInTheDocument();
  });

  it("erro nas conquistas não esconde o resultado", async () => {
    server.use(http.get("/api/users/:userId/achievements", () => HttpResponse.json(
      { error: { code: "internal_error", message: "x", request_id: "test0001", fields: null } },
      { status: 500 },
    )));
    await renderAt("/matches/14");
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Vitória!")).toBeInTheDocument();
    expect(within(rowOf("akita")).getByText("(você)")).toBeInTheDocument();
  });
});
