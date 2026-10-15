import { render, screen, waitFor } from "@testing-library/react";
import { delay, http, HttpResponse } from "msw";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { beforeEach, describe, expect, it } from "vitest";
import { apiFetch } from "../api/client";
import AuthRoot from "../auth/AuthRoot";
import { safeNext } from "../auth/safeNext";
import { setAccessToken } from "../auth/token";
import i18n from "../i18n";
import { MOCK_PASSWORD } from "../mocks/handlers";
import { server } from "../mocks/server";
import Lobby from "../pages/Lobby";
import PublicOnly from "./PublicOnly";
import RequireAuth from "./RequireAuth";

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      {
        element: <AuthRoot />,
        children: [
          { element: <PublicOnly />, children: [{ path: "login", element: <p>tela de login</p> }] },
          { element: <RequireAuth />, children: [{ path: "lobby", element: <Lobby /> }] },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

// Simula "recarregar a página": o cookie do mock fica ligado, mas o token em memória some
async function reloadWithSession() {
  await apiFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "a@b.c", password: MOCK_PASSWORD }),
  });
  setAccessToken(null);
}

beforeEach(async () => {
  localStorage.clear();
  setAccessToken(null);
  await i18n.changeLanguage("en");
});

describe("safeNext", () => {
  it.each([
    ["/lobby", "/lobby"],
    ["/users/7?tab=stats", "/users/7?tab=stats"],
    [null, "/lobby"],
    ["", "/lobby"],
    ["lobby", "/lobby"],
    ["//evil.com", "/lobby"],
    ["//https://evil.com", "/lobby"],
    ["/\\evil.com", "/lobby"],
    ["/login", "/lobby"],
    ["/signup?next=/lobby", "/lobby"],
    ["/loginx", "/loginx"],
  ])("%s vira %s", (raw, expected) => {
    expect(safeNext(raw)).toBe(expected);
  });
});

describe("RequireAuth", () => {
  it("sem sessão: vai para /login?next= com a rota de origem", async () => {
    const router = renderAt("/lobby");
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(router.state.location.search).toBe("?next=%2Flobby");
    expect(screen.getByText("tela de login")).toBeInTheDocument();
  });

  it("enquanto o /refresh não responde, mostra carregando e não redireciona", async () => {
    server.use(
      http.post("/api/auth/refresh", async () => {
        await delay(50);
        return HttpResponse.json({ authenticated: false });
      }),
    );
    const router = renderAt("/lobby");
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/lobby");
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
  });

  it("com sessão: abre a rota e mostra o nome do User", async () => {
    await reloadWithSession();
    renderAt("/lobby");
    expect(await screen.findByRole("heading", { name: /augusto/ })).toBeInTheDocument();
  });
});

describe("PublicOnly", () => {
  it("com sessão: /login manda para o next", async () => {
    await reloadWithSession();
    const router = renderAt("/login?next=/lobby");
    await waitFor(() => expect(router.state.location.pathname).toBe("/lobby"));
  });

  it("com sessão: next externo é ignorado", async () =>{
    await reloadWithSession();
    const router = renderAt("/login?next=//evil.com");
    await waitFor(() => expect(router.state.location.pathname).toBe("/lobby"));
  });
});