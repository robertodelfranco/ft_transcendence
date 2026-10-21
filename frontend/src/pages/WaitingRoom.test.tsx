import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { beforeEach, describe, expect, it } from "vitest";
import { apiFetch } from "../api/client";
import type { RoomInfo, RoomPlayer } from "../api/types";
import { setAccessToken } from "../auth/token";
import i18n from "../i18n";
import { publish } from "../mocks/appSocketHandlers";
import roomsFixture from "../mocks/fixtures/rooms.json";
import { MOCK_PASSWORD } from "../mocks/handlers";
import { server } from "../mocks/server";
import { routes } from "../routes";

const [room12] = roomsFixture.items as RoomInfo[];

// Login no mock e depois "recarrega" na rota pedida. O perfil do mock é pt-BR
async function login() {
  await apiFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "a@b.c", password: MOCK_PASSWORD }),
  });
}

function renderAt(path: string) {
  setAccessToken(null);
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(async () => {
  localStorage.clear();
  setAccessToken(null);
  await i18n.changeLanguage("en");
});

describe("sala de espera do anfitrião", () => {
  it("Iniciar leva a /play", async () => {
    const user = userEvent.setup();
    await login();
    await apiFetch("/api/matches", { method: "POST", body: JSON.stringify({ mode: "coop", map: "enemy" }) });
    const router = renderAt("/lobby/100");
    await user.click(await screen.findByRole("button", { name: "Iniciar partida" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/play/100"));
    // a URL muda antes de o React desenhar a página nova: findBy espera
    expect(await screen.findByText("Conectando à partida #100…")).toBeInTheDocument();
    expect(screen.queryByText("Esta partida já começou.")).not.toBeInTheDocument();
  });

  it("quem é anfitrião aparece marcado", async () => {
    await login();
    await apiFetch("/api/matches", { method: "POST", body: JSON.stringify({ mode: "coop", map: "enemy" }) });
    renderAt("/lobby/100");
    expect(await screen.findByText("anfitrião")).toBeInTheDocument();
    expect(screen.getByText("(você)")).toBeInTheDocument();
  });
});

describe("sala de espera de quem não é anfitrião", () => {
  async function joinRoom13() {
    const user = userEvent.setup();
    await login();
    const router = renderAt("/lobby/13");
    await user.click(await screen.findByRole("button", { name: "Entrar nesta sala" }));
    await screen.findByRole("heading", { name: "Jogadores (3/3)" });
    return { user, router };
  }

  it("entra pela URL, não vê Iniciar e espera o anfitrião", async () => {
    await joinRoom13();
    expect(screen.queryByRole("button", { name: "Iniciar partida" })).not.toBeInTheDocument();
    expect(screen.getByText("Esperando o anfitrião iniciar a partida.")).toBeInTheDocument();
  });

  it("Estou pronto muda o próprio estado", async () => {
    const { user } = await joinRoom13();
    await user.click(screen.getByRole("button", { name: "Estou pronto" }));
    expect(await screen.findByRole("button", { name: "Não estou pronto" })).toBeInTheDocument();
  });

  it("Sair volta ao lobby", async () => {
    const { user, router } = await joinRoom13();
    await user.click(screen.getByRole("button", { name: "Sair da sala" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/lobby"));
  });

  it("match_started leva a /play", async () => {
    const { router } = await joinRoom13();
    act(() => publish({ type: "match_started", match_id: 13 }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/play/13"));
  });

  it("lobby_removed aborted avisa que a sala fechou", async () => {
    await joinRoom13();
    act(() => publish({ type: "lobby_removed", match_id: 13, reason: "aborted" }));
    expect(await screen.findByText("Esta sala foi fechada.")).toBeInTheDocument();
  });
});

it("uma sala que não existe avisa e oferece voltar", async () => {
  await login();
  renderAt("/lobby/999");
  expect(await screen.findByText("Esta sala não existe.")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Voltar ao lobby" })).toBeInTheDocument();
});

// Regressão (revisão do Roberto no PR #50): a resposta do ready demora, o socket traz um estado
// mais novo com outro Player, e a resposta velha chega depois
it("uma resposta HTTP antiga não apaga o estado mais novo que veio pelo socket", async () => {
  const user = userEvent.setup();
  await login();
  renderAt("/lobby/12");
  await user.click(await screen.findByRole("button", { name: "Entrar nesta sala" }));
  await screen.findByRole("heading", { name: "Jogadores (2/5)" });

  const [akita] = room12.players;
  const me: RoomPlayer = {
    user_id: 7, username: "augusto", avatar_url: "/media/avatars/default.png",
    ready: true, connected: true, joined_at: "2026-10-20T18:10:00Z",
  };
  const newcomer: RoomPlayer = { ...me, user_id: 21, username: "novato", ready: false };
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  // a resposta segura o estado do momento do ready: 2 Players
  server.use(
    http.post("/api/matches/:matchId/ready", async () => {
      await gate;
      return HttpResponse.json({ ...room12, players: [akita, me] });
    }),
  );

  await user.click(screen.getByRole("button", { name: "Estou pronto" }));
  act(() => publish({ type: "lobby_update", room: { ...room12, players: [akita, me, newcomer] } }));
  await screen.findByRole("heading", { name: "Jogadores (3/5)" });

  release();
  // a ação terminou quando o botão volta a ficar habilitado
  await waitFor(() => expect(screen.getByRole("button", { name: "Não estou pronto" })).toBeEnabled());
  expect(screen.getByRole("heading", { name: "Jogadores (3/5)" })).toBeInTheDocument();
  expect(screen.getByText("novato")).toBeInTheDocument();
});
