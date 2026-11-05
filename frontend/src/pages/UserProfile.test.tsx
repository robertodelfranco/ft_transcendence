import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { beforeEach, describe, expect, it } from "vitest";
import { apiFetch } from "../api/client";
import { setAccessToken } from "../auth/token";
import i18n from "../i18n";
import { publish } from "../mocks/appSocketHandlers";
import { MOCK_PASSWORD } from "../mocks/handlers";
import { server } from "../mocks/server";
import { routes } from "../routes";

// Como recarregar a página com sessão: o cookie do mock fica, o token em memória some. O perfil do
// mock é pt-BR, então a tela aparece em português. No mock, o augusto (7) já tem o roberto (3)
// como amigo; o akita (5) não é amigo
async function renderWithSession(path: string) {
  await apiFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "a@b.c", password: MOCK_PASSWORD }),
  });
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

describe("/users/:userId", () => {
  it("amigo: nome, data de entrada e status ao vivo", async () => {
    await renderWithSession("/users/3");
    expect(await screen.findByRole("heading", { name: "roberto" })).toBeInTheDocument();
    expect(screen.getByText("Membro desde 1 de outubro de 2026")).toBeInTheDocument();
    // o welcome do mock não traz ninguém online
    expect(await screen.findByText("Offline")).toBeInTheDocument();
    act(() => publish({ type: "presence", user_id: 3, online: true }));
    expect(await screen.findByText("Online")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remover dos amigos" })).toBeInTheDocument();
  });

  it("adicionar: o botão troca e o status aparece com o online da resposta", async () => {
    server.use(http.put("/api/users/me/friends/:userId", () => HttpResponse.json({
      id: 5, username: "akita", avatar_url: "/media/avatars/default.png",
      created_at: "2026-10-04T12:00:00Z", online: true, since: "2026-11-03T12:00:00Z",
    })));
    // o status do roberto em Offline garante que o welcome já chegou e não apaga o setOnline
    const router = await renderWithSession("/users/3");
    await screen.findByText("Offline");
    await act(() => router.navigate("/users/5"));

    expect(await screen.findByRole("heading", { name: "akita" })).toBeInTheDocument();
    expect(screen.queryByText("Offline")).not.toBeInTheDocument(); // não amigo: sem status
    await userEvent.click(screen.getByRole("button", { name: "Adicionar aos amigos" }));

    expect(await screen.findByRole("button", { name: "Remover dos amigos" })).toBeInTheDocument();
    expect(screen.getByText("Online")).toBeInTheDocument();
  });

  it("remover: o botão volta e o status some", async () => {
    await renderWithSession("/users/3");
    await userEvent.click(await screen.findByRole("button", { name: "Remover dos amigos" }));
    expect(await screen.findByRole("button", { name: "Adicionar aos amigos" })).toBeInTheDocument();
    expect(screen.queryByText(/^(Online|Offline|Conectando…)$/)).not.toBeInTheDocument();
  });

  it("falha ao adicionar mostra o erro traduzido e deixa tentar de novo", async () => {
    server.use(http.put("/api/users/me/friends/:userId", () => HttpResponse.error()));
    await renderWithSession("/users/5");
    await userEvent.click(await screen.findByRole("button", { name: "Adicionar aos amigos" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Sem conexão com o servidor");
    expect(screen.getByRole("button", { name: "Adicionar aos amigos" })).toBeEnabled();
  });

  it("o próprio perfil leva às configurações, sem botão de amizade", async () => {
    await renderWithSession("/users/7");
    expect(await screen.findByRole("heading", { name: "augusto" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Editar perfil" })).toHaveAttribute("href", "/settings");
    expect(screen.queryByRole("button", { name: "Adicionar aos amigos" })).not.toBeInTheDocument();
  });

  it("User que não existe: erro traduzido", async () => {
    await renderWithSession("/users/999");
    expect(await screen.findByRole("alert")).toHaveTextContent("Usuário não encontrado.");
  });

  it("id que não é número nem chega ao servidor", async () => {
    let requested = false;
    server.use(http.get("/api/users/:userId", () => {
      requested = true;
      return HttpResponse.json({});
    }));
    await renderWithSession("/users/abc");
    expect(await screen.findByRole("alert")).toHaveTextContent("Usuário não encontrado.");
    expect(requested).toBe(false);
  });
});
