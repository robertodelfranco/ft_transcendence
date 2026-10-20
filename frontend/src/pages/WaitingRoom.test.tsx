import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { beforeEach, describe, expect, it } from "vitest";
import { apiFetch } from "../api/client";
import { setAccessToken } from "../auth/token";
import i18n from "../i18n";
import { publish } from "../mocks/appSocketHandlers";
import { MOCK_PASSWORD } from "../mocks/handlers";
import { routes } from "../routes";

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
