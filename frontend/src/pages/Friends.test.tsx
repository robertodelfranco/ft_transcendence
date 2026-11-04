import { act, render, screen, within } from "@testing-library/react";
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

// Sessão do mock (augusto, pt-BR), como ao recarregar a página. O roberto já é amigo; o akita não
async function renderWithSession(path = "/friends") {
  await apiFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "a@b.c", password: MOCK_PASSWORD }),
  });
  setAccessToken(null);
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

// O ?search= de cada busca que chegou ao servidor. O handler não responde: o MSW passa para o do mock
let searches: string[];

beforeEach(async () => {
  localStorage.clear();
  setAccessToken(null);
  await i18n.changeLanguage("en");
  searches = [];
  server.use(http.get("/api/users", ({ request }) => {
    searches.push(new URL(request.url).searchParams.get("search") ?? "");
  }));
});

const friendList = async () => (await screen.findByText(/^\d+ amigos?$/)).nextElementSibling as HTMLElement;

describe("/friends: lista", () => {
  it("mostra os amigos com link para o perfil e presença ao vivo", async () => {
    await renderWithSession();
    expect(await screen.findByText("1 amigo")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "roberto" })).toHaveAttribute("href", "/users/3");
    expect(await screen.findByText("Offline")).toBeInTheDocument();

    act(() => publish({ type: "presence", user_id: 3, online: true }));
    expect(await screen.findByText("Online")).toBeInTheDocument();
  });

  it("o online da lista vale para quem virou amigo depois do welcome", async () => {
    server.use(http.get("/api/users/me/friends", () => HttpResponse.json({ items: [{
      id: 5, username: "akita", avatar_url: "/media/avatars/default.png",
      created_at: "2026-10-04T12:00:00Z", online: true, since: "2026-11-04T12:00:00Z",
    }] })));
    // o perfil do roberto em Offline garante que o welcome (sem ninguém online) já chegou
    const router = await renderWithSession("/users/3");
    await screen.findByText("Offline");
    await act(() => router.navigate("/friends"));

    expect(await screen.findByRole("link", { name: "akita" })).toBeInTheDocument();
    expect(screen.getByText("Online")).toBeInTheDocument();
  });

  it("remover tira da lista, e a lista vazia diz o que fazer", async () => {
    const user = userEvent.setup();
    await renderWithSession();
    await user.click(await screen.findByRole("button", { name: "Remover roberto dos amigos" }));

    expect(await screen.findByText("Você ainda não adicionou ninguém. Use a busca abaixo.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "roberto" })).not.toBeInTheDocument();
    expect(screen.queryByText(/^\d+ amigos?$/)).not.toBeInTheDocument(); // sem "0 amigo"
  });

  it("falha ao carregar mostra o erro traduzido", async () => {
    server.use(http.get("/api/users/me/friends", () => HttpResponse.error()));
    await renderWithSession();
    expect(await screen.findByRole("alert")).toHaveTextContent("Sem conexão com o servidor");
  });
});

describe("/friends: busca", () => {
  it("busca pelo prefixo e adiciona: o novo amigo entra na lista", async () => {
    const user = userEvent.setup();
    await renderWithSession();
    await screen.findByText("1 amigo");
    await user.type(screen.getByLabelText("Buscar pelo nome de usuário"), "ak");

    await user.click(await screen.findByRole("button", { name: "Adicionar akita aos amigos" }));

    expect(await screen.findByText("2 amigos")).toBeInTheDocument();
    expect(within(await friendList()).getByRole("link", { name: "akita" })).toBeInTheDocument();
    expect(screen.getByText("Já é amigo")).toBeInTheDocument();
  });

  it("quem já é amigo aparece marcado, sem botão", async () => {
    const user = userEvent.setup();
    await renderWithSession();
    await screen.findByText("1 amigo");
    await user.type(screen.getByLabelText("Buscar pelo nome de usuário"), "ro");

    expect(await screen.findByText("Já é amigo")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Adicionar/ })).not.toBeInTheDocument();
  });

  it("espera parar de digitar e manda em minúsculas: uma busca só", async () => {
    const user = userEvent.setup();
    await renderWithSession();
    await user.type(await screen.findByLabelText("Buscar pelo nome de usuário"), "AKIT");

    expect(await screen.findByRole("link", { name: "akita" })).toBeInTheDocument();
    expect(searches).toEqual(["akit"]);
  });

  it("menos de 2 caracteres, ou caractere fora do alfabeto, nem sai", async () => {
    const user = userEvent.setup();
    await renderWithSession();
    const field = await screen.findByLabelText("Buscar pelo nome de usuário");
    await user.type(field, "a");
    await new Promise((resolve) => setTimeout(resolve, 400));
    await user.clear(field);
    await user.type(field, "a%");
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(searches).toEqual([]);
  });

  it("ninguém encontrado", async () => {
    const user = userEvent.setup();
    await renderWithSession();
    await user.type(await screen.findByLabelText("Buscar pelo nome de usuário"), "zz");
    expect(await screen.findByText("Ninguém encontrado.")).toBeInTheDocument();
  });

  it("limite de buscas vira aviso traduzido", async () => {
    server.use(http.get("/api/users", () => HttpResponse.json(
      { error: { code: "rate_limited", message: "limit", request_id: "r3", fields: null } },
      { status: 429, headers: { "Retry-After": "30" } },
    )));
    const user = userEvent.setup();
    await renderWithSession();
    await user.type(await screen.findByLabelText("Buscar pelo nome de usuário"), "ak");
    expect(await screen.findByRole("alert")).toHaveTextContent("Muitas tentativas.");
  });
});
