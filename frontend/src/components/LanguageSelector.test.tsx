import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../api/client";
import { setAccessToken } from "../auth/token";
import i18n from "../i18n";
import authResponse from "../mocks/fixtures/authResponse.json";
import { MOCK_PASSWORD } from "../mocks/handlers";
import { server } from "../mocks/server";
import { routes } from "../routes";

function renderAt(path: string) {
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />);
}

// Simula "recarregar a página": o cookie do mock fica ligado, mas o token em memória some
async function reloadWithSession() {
  await apiFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "a@b.c", password: MOCK_PASSWORD }),
  });
  setAccessToken(null);
}

// Com sessão, o idioma do perfil do mock (pt-BR) já está aplicado quando o "Sair" aparece
async function openWithSession() {
  await reloadWithSession();
  renderAt("/privacy");
  await screen.findByRole("button", { name: "Sair" });
}

beforeEach(async () => {
  localStorage.clear();
  setAccessToken(null);
  await i18n.changeLanguage("en");
});

describe("LanguageSelector", () => {
  it("sem sessão: troca na tela e no navegador, sem chamar o perfil", async () => {
    const patched = vi.fn();
    server.use(http.patch("/api/users/me", () => {
      patched();
      return HttpResponse.json(authResponse.user);
    }));
    renderAt("/privacy");
    await userEvent.setup().selectOptions(screen.getByLabelText("Language"), "es");
    expect(i18n.resolvedLanguage).toBe("es");
    expect(localStorage.getItem("lang")).toBe("es");
    expect(patched).not.toHaveBeenCalled();
  });

  it("com sessão: grava a escolha no perfil", async () => {
    const bodies: unknown[] = [];
    server.use(http.patch("/api/users/me", async ({ request }) => {
      bodies.push(await request.json());
      return HttpResponse.json({ ...authResponse.user, preferred_language: "es" });
    }));
    await openWithSession();
    await userEvent.setup().selectOptions(screen.getByLabelText("Idioma"), "es");
    await waitFor(() => expect(bodies).toEqual([{ preferred_language: "es" }]));
    expect(i18n.resolvedLanguage).toBe("es");
  });

  it("se o perfil não grava, a troca continua na tela e o erro aparece no idioma novo", async () => {
    server.use(http.patch("/api/users/me", () => HttpResponse.json(
      { error: { code: "internal_error", message: "db down", request_id: "abc" } }, { status: 500 },
    )));
    await openWithSession();
    await userEvent.setup().selectOptions(screen.getByLabelText("Idioma"), "es");
    expect(await screen.findByText(/Algo salió mal de nuestro lado/)).toBeInTheDocument();
    expect(i18n.resolvedLanguage).toBe("es");
  });
});
