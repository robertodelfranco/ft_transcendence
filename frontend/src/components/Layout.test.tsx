import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { beforeEach, describe, expect, it } from "vitest";
import { apiFetch } from "../api/client";
import { getAccessToken, setAccessToken } from "../auth/token";
import i18n from "../i18n";
import { MOCK_PASSWORD } from "../mocks/handlers";
import { routes } from "../routes";

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

// simula "recarregar a página": o cookie do mock fica ligado, mas o token em memória some
async function reloadWithSession() {
  await apiFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "a@b.c", password: MOCK_PASSWORD }),
  });
  setAccessToken(null);
}

beforeEach(async () =>{
  localStorage.clear();
  setAccessToken(null);
  await i18n.changeLanguage("en");
});

describe("cabeçalho", () => {
  it("sem sessão: não mostra o botão de sair", async () => {
    renderAt("/privacy");
    await waitFor(() => expect(screen.getByLabelText("Language")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /log out|sair/i })).not.toBeInTheDocument();
  });

  it("com sessão: mostra o username e o botão no idioma do perfil", async () => {
    await reloadWithSession();
    renderAt("/lobby");
    // o perfil do mock é pt-BR, então o botão aparece como "Sair"
    expect(await screen.findByRole("button", { name: "Sair" })).toBeInTheDocument();
    expect(screen.getAllByText("augusto").length).toBeGreaterThan(0);
  });

  it("com sessão: o nome leva ao próprio perfil, e os links abrem ranking, amigos e configurações", async () => {
    const user = userEvent.setup();
    await reloadWithSession();
    renderAt("/lobby");
    const nav = await screen.findByRole("navigation", { name: "Sua conta" });
    expect(within(nav).getByRole("link", { name: "augusto" })).toHaveAttribute("href", "/users/7");

    await user.click(within(nav).getByRole("link", { name: "Ranking" }));
    expect(await screen.findByRole("heading", { name: "Ranking" })).toBeInTheDocument();
    expect(document.title).toBe("Ranking · Catacombs 42");

    await user.click(within(nav).getByRole("link", { name: "Amigos" }));
    expect(await screen.findByRole("heading", { name: "Amigos" })).toBeInTheDocument();
    expect(document.title).toBe("Amigos · Catacombs 42");

    await user.click(within(nav).getByRole("link", { name: "Configurações" }));
    expect(await screen.findByRole("heading", { name: "Configurações" })).toBeInTheDocument();
  });

  it("Sair: limpa a sessão, esconde o botão e volta para /", async () => {
    const user = userEvent.setup();
    await reloadWithSession();
    const router = renderAt("/lobby");

    await user.click(await screen.findByRole("button", { name: "Sair" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));

    // o guarda de /lobby não pode redirecionar por cima depois: espera e confere de novo
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(router.state.location.pathname).toBe("/");
    expect(router.state.location.search).toBe("");
    expect(screen.queryByRole("button", { name: "Sair" })).not.toBeInTheDocument();
    expect(getAccessToken()).toBeNull();
  });
})

describe("página atual nos links de navegação", () => {
  it("no rodapé, só o link da página aberta fica marcado", async () => {
    renderAt("/privacy");
    const footer = await screen.findByRole("navigation", { name: "Legal information" });
    expect(within(footer).getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("aria-current", "page");
    expect(within(footer).getByRole("link", { name: "Terms of Service" })).not.toHaveAttribute("aria-current");
  });

  it("no cabeçalho, a marca acompanha a navegação", async () => {
    const user = userEvent.setup();
    await reloadWithSession();
    renderAt("/friends");
    const nav = await screen.findByRole("navigation", { name: "Sua conta" });
    expect(within(nav).getByRole("link", { name: "Amigos" })).toHaveAttribute("aria-current", "page");

    await user.click(within(nav).getByRole("link", { name: "Ranking" }));
    await waitFor(() => expect(within(nav).getByRole("link", { name: "Ranking" })).toHaveAttribute("aria-current", "page"));
    expect(within(nav).getByRole("link", { name: "Amigos" })).not.toHaveAttribute("aria-current");
  });
});

describe("telas da conta", () => {
  it.each(["/users/7", "/settings", "/friends", "/leaderboard"])("%s sem sessão manda para o login", async (path) => {
    const router = renderAt(path);
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(router.state.location.search).toBe(`?next=${encodeURIComponent(path)}`);
  });
});

describe("modo partida (#254)", () => {
  // só a rota com handle.compact encolhe o Layout: as outras páginas ficam como sempre
  it("fora da partida, o layout é o padrão e o título da página aparece", async () => {
    renderAt("/login");
    expect(await screen.findByRole("heading", { level: 1 })).not.toHaveClass("sr-only");
    expect(document.querySelector("[data-layout]")).toHaveAttribute("data-layout", "default");
  });
});
