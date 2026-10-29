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

  it("duas escolhas rápidas: um PATCH por vez, e o perfil fica com a última", async () => {
    const bodies: unknown[] = [];
    const pending: Array<() => void> = [];
    let saved = "pt-BR";
    server.use(http.patch("/api/users/me", async ({ request }) => {
      const body = (await request.json()) as { preferred_language: string };
      bodies.push(body);
      await new Promise<void>((resolve) => pending.push(resolve)); // o teste decide quando responde
      saved = body.preferred_language;
      return HttpResponse.json({ ...authResponse.user, preferred_language: saved });
    }));
    await openWithSession();
    const user = userEvent.setup();
    await user.selectOptions(screen.getByRole("combobox"), "en");
    await user.selectOptions(screen.getByRole("combobox"), "es");

    // em paralelo, o "es" chegaria antes da resposta do "en" e o servidor terminaria com "en"
    await waitFor(() => expect(bodies).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(bodies).toEqual([{ preferred_language: "en" }]);

    pending[0]();
    await waitFor(() => expect(bodies).toHaveLength(2));
    pending[1]();
    await waitFor(() => expect(saved).toBe("es"));
    expect(i18n.resolvedLanguage).toBe("es");
  });

  it("se só a escolha anterior falha, o aviso some quando a última grava", async () => {
    let calls = 0;
    let releaseFirst!: () => void;
    const firstHeld = new Promise<void>((resolve) => (releaseFirst = resolve));
    server.use(http.patch("/api/users/me", async ({ request }) => {
      calls += 1;
      if (calls === 1) {
        await firstHeld; // o "en" só falha depois que o "es" já foi escolhido
        return HttpResponse.json(
          { error: { code: "internal_error", message: "db down", request_id: "abc" } }, { status: 500 },
        );
      }
      return HttpResponse.json({ ...authResponse.user, ...((await request.json()) as object) });
    }));
    await openWithSession();
    const user = userEvent.setup();
    await user.selectOptions(screen.getByRole("combobox"), "en");
    await user.selectOptions(screen.getByRole("combobox"), "es");
    releaseFirst();

    await waitFor(() => expect(calls).toBe(2));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("sair enquanto a escolha ainda grava não mostra erro", async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    server.use(http.patch("/api/users/me", async () => {
      await held;
      return HttpResponse.json({ ...authResponse.user, preferred_language: "es" });
    }));
    await openWithSession();
    const user = userEvent.setup();
    await user.selectOptions(screen.getByRole("combobox"), "es");
    await user.click(screen.getByRole("button", { name: "Cerrar sesión" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Cerrar sesión" })).not.toBeInTheDocument());

    release();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(i18n.resolvedLanguage).toBe("es");
  });
});
