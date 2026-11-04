import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { beforeEach, describe, expect, it } from "vitest";
import { apiFetch } from "../api/client";
import { setAccessToken } from "../auth/token";
import i18n from "../i18n";
import { MOCK_PASSWORD } from "../mocks/handlers";
import { server } from "../mocks/server";
import { routes } from "../routes";

// Sessão do mock (augusto, pt-BR), como ao recarregar a página
async function renderSettings() {
  await apiFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "a@b.c", password: MOCK_PASSWORD }),
  });
  setAccessToken(null);
  const router = createMemoryRouter(routes, { initialEntries: ["/settings"] });
  render(<RouterProvider router={router} />);
  return await screen.findByLabelText("Nome de usuário");
}

// O que cada PATCH levou no corpo. O handler não responde: o MSW passa para o do mock
let patches: unknown[];

beforeEach(async () => {
  localStorage.clear();
  setAccessToken(null);
  await i18n.changeLanguage("en");
  patches = [];
  server.use(http.patch("/api/users/me", async ({ request }) => {
    patches.push(await request.clone().json());
  }));
});

describe("/settings", () => {
  it("troca o username: manda normalizado e o cabeçalho acompanha", async () => {
    const user = userEvent.setup();
    const field = await renderSettings();
    expect(field).toHaveValue("augusto");

    await user.clear(field);
    await user.type(field, " Augusto_42 ");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("Alterações salvas.")).toBeInTheDocument();
    expect(patches).toEqual([{ username: "augusto_42" }]);
    const nav = screen.getByRole("navigation", { name: "Sua conta" });
    expect(within(nav).getByRole("link", { name: "augusto_42" })).toBeInTheDocument();
  });

  it("username inválido nem sai: o erro aparece no campo", async () => {
    const user = userEvent.setup();
    const field = await renderSettings();
    await user.clear(field);
    await user.type(field, "ab");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("Muito curto.")).toBeInTheDocument();
    expect(field).toHaveFocus();
    expect(patches).toEqual([]);
  });

  it("username em uso: o 409 aparece no campo", async () => {
    server.use(http.patch("/api/users/me", () => HttpResponse.json(
      { error: { code: "username_taken", message: "username taken", request_id: "r1", fields: null } },
      { status: 409 },
    )));
    const user = userEvent.setup();
    const field = await renderSettings();
    await user.clear(field);
    await user.type(field, "roberto");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("Este nome de usuário já está em uso.")).toBeInTheDocument();
    expect(field).toHaveAttribute("aria-invalid", "true");
  });

  it("o mesmo nome não manda nada", async () => {
    const user = userEvent.setup();
    await renderSettings();
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByText("Alterações salvas.")).toBeInTheDocument();
    expect(patches).toEqual([]);
  });

  it("falha de rede vira aviso traduzido", async () => {
    server.use(http.patch("/api/users/me", () => HttpResponse.error()));
    const user = userEvent.setup();
    const field = await renderSettings();
    await user.clear(field);
    await user.type(field, "outro_nome");
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Sem conexão com o servidor");
  });

  it("tem o seletor de idioma, que grava no perfil", async () => {
    const user = userEvent.setup();
    await renderSettings();
    const main = screen.getByRole("main");
    await user.selectOptions(within(main).getByLabelText("Idioma"), "es");
    expect(await within(main).findByLabelText("Nombre de usuario")).toBeInTheDocument();
    expect(patches).toEqual([{ preferred_language: "es" }]);
  });
});
