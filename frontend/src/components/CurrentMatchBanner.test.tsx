import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { beforeEach, describe, expect, it } from "vitest";
import { apiFetch } from "../api/client";
import type { RoomInfo, RoomStatus } from "../api/types";
import { setAccessToken } from "../auth/token";
import i18n from "../i18n";
import authResponse from "../mocks/fixtures/authResponse.json";
import { MOCK_PASSWORD } from "../mocks/handlers";
import { server } from "../mocks/server";
import { routes } from "../routes";

const MATCH_ID = 42;
const NOTICE = "Você tem uma partida em andamento.";

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

// o mesmo "recarregar a página" do Layout.test: o cookie do mock fica, o token em memória some
async function reloadWithSession() {
  await apiFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "a@b.c", password: MOCK_PASSWORD }),
  });
  setAccessToken(null);
}

// A Room do User 7 (o do mock), no status pedido
function room(status: RoomStatus): RoomInfo {
  return {
    match_id: MATCH_ID, mode: "coop", map: "dungeon_map", max_players: 2, min_players: 2, status,
    created_by: 15, created_at: "2026-11-13T18:00:00Z",
    options: { theme: "dungeon", start_hp: 10, pickups: { potion: true, mana: true, armor: true } },
    players: [
      { user_id: 15, username: "akita", avatar_url: "/media/avatars/default.png", ready: true,
        connected: true, joined_at: "2026-11-13T18:00:00Z", character_id: "nemesis" },
      { user_id: 7, username: "augusto", avatar_url: "/media/avatars/default.png", ready: true,
        connected: false, joined_at: "2026-11-13T18:00:05Z", character_id: "nemesis" },
    ],
  };
}

// O servidor responde a GET /api/matches/current com esta Room, ou 204 sem nenhuma
function currentMatch(status: RoomStatus | null) {
  server.use(http.get("/api/matches/current", () =>
    status ? HttpResponse.json(room(status)) : new HttpResponse(null, { status: 204 })));
}

// a casca terminou de carregar a sessão: o botão de sair do cabeçalho está na tela
async function shellReady() {
  await screen.findByRole("button", { name: /^(Sair|Log out|Salir)$/ });
}

beforeEach(async () => {
  localStorage.clear();
  setAccessToken(null);
  await i18n.changeLanguage("en");
});

describe("faixa de partida em andamento", () => {
  it("com partida em andamento, mostra o aviso e o link para /play", async () => {
    currentMatch("running");
    await reloadWithSession();
    renderAt("/lobby");

    // role="status": o leitor de tela anuncia a faixa quando ela aparece
    const notice = await screen.findByText(NOTICE);
    expect(notice.closest('[role="status"]')).not.toBeNull();
    expect(screen.getByRole("link", { name: "Voltar à partida" }))
      .toHaveAttribute("href", `/play/${MATCH_ID}`);
  });

  it("Voltar à partida leva ao /play, onde a faixa não aparece", async () => {
    const user = userEvent.setup();
    currentMatch("running");
    await reloadWithSession();
    const router = renderAt("/friends");

    await user.click(await screen.findByRole("link", { name: "Voltar à partida" }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/play/${MATCH_ID}`));
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });

  it("sem partida (204), não mostra nada", async () => {
    currentMatch(null);
    await reloadWithSession();
    renderAt("/lobby");

    await shellReady();
    await new Promise((resolve) => setTimeout(resolve, 50)); // a consulta já respondeu
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });

  it("numa sala de espera (lobby), não mostra nada: ela já está na lista do /lobby", async () => {
    currentMatch("lobby");
    await reloadWithSession();
    renderAt("/friends");

    await shellReady();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });

  it("dentro do /play da partida, não mostra nada", async () => {
    currentMatch("running");
    await reloadWithSession();
    renderAt(`/play/${MATCH_ID}`);

    await shellReady();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });

  it("consulta de novo a cada troca de página: some quando a partida acaba", async () => {
    const user = userEvent.setup();
    currentMatch("running");
    await reloadWithSession();
    renderAt("/lobby");
    expect(await screen.findByText(NOTICE)).toBeInTheDocument();

    currentMatch(null); // o Grace period venceu, ou a partida terminou
    await user.click(screen.getByRole("link", { name: "Amigos" }));
    await screen.findByRole("heading", { name: "Amigos" });
    await waitFor(() => expect(screen.queryByText(NOTICE)).not.toBeInTheDocument());
  });

  it("sem sessão, não mostra nada", async () => {
    currentMatch("running");
    renderAt("/privacy");

    await screen.findByLabelText("Language");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });

  it("segue o idioma do perfil", async () => {
    server.use(http.post("/api/auth/refresh", () =>
      HttpResponse.json({ ...authResponse, user: { ...authResponse.user, preferred_language: "en" } })));
    currentMatch("running");
    await reloadWithSession();
    renderAt("/lobby");

    expect(await screen.findByText("You have a match in progress.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to the match" })).toBeInTheDocument();
  });
});
