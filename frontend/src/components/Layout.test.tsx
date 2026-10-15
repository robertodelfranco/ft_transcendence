import { render, screen, waitFor } from "@testing-library/react";
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