import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { beforeEach, describe, expect, it } from "vitest";
import { apiFetch } from "../api/client";
import type { RoomInfo } from "../api/types";
import { setAccessToken } from "../auth/token";
import i18n from "../i18n";
import { publish } from "../mocks/appSocketHandlers";
import roomsFixture from "../mocks/fixtures/rooms.json";
import { MOCK_PASSWORD } from "../mocks/handlers";
import { server } from "../mocks/server";
import { routes } from "../routes";

const [room12, room13] = roomsFixture.items as RoomInfo[];

// Simula "recarregar a página" com sessão: o perfil do mock é pt-BR, então a tela fica em pt-BR
async function renderWithSession(path = "/lobby") {
  await apiFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "a@b.c", password: MOCK_PASSWORD }),
  });
  setAccessToken(null);
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  // a tela só aparece depois que o RequireAuth confirma a sessão
  await screen.findByRole("region", { name: "Salas abertas" });
  return router;
}

// Só a lista: "Masmorra" também é Theme e opção do formulário de criação
const list = () => within(screen.getByRole("region", { name: "Salas abertas" }));
const roomCards = () => list().getAllByRole("listitem");

beforeEach(async () => {
  localStorage.clear();
  setAccessToken(null);
  await i18n.changeLanguage("en");
});

describe("lista de Rooms", () => {
  it("mostra as Rooms abertas com Map, Mode, vagas e anfitrião", async () => {
    await renderWithSession();
    expect(await list().findByText("Masmorra")).toBeInTheDocument();
    const card = roomCards()[0];
    expect(within(card).getByText("Cooperativo")).toBeInTheDocument();
    expect(within(card).getByText(/1\/5 jogadores/)).toBeInTheDocument();
    expect(within(card).getByText(/Anfitrião: akita/)).toBeInTheDocument();
    expect(list().getByText("Salões do esgoto")).toBeInTheDocument();
  });

  it("o filtro por modo esconde as Rooms de outro Mode", async () => {
    const user = userEvent.setup();
    await renderWithSession();
    await list().findByText("Masmorra");
    await user.selectOptions(screen.getByLabelText("Filtrar por modo"), "pvp");
    expect(list().queryByText("Masmorra")).not.toBeInTheDocument();
    expect(list().getByText(/Nenhuma sala aberta/)).toBeInTheDocument();
  });

  it("lobby_update acrescenta uma Room e lobby_removed a tira, sem recarregar", async () => {
    await renderWithSession();
    await list().findByText("Masmorra");
    act(() => publish({ type: "lobby_update", room: { ...room13, match_id: 77, map: "enemy" } }));
    expect(await list().findByText("Salões inimigos")).toBeInTheDocument();
    act(() => publish({ type: "lobby_removed", match_id: 12, reason: "aborted" }));
    await waitFor(() => expect(list().queryByText("Masmorra")).not.toBeInTheDocument());
  });

  it("uma mensagem que chega durante o GET entra depois da resposta", async () => {
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    // o GET fica parado e responde a lista como estava antes da mensagem
    server.use(
      http.get("/api/matches", async () => {
        calls += 1;
        await gate;
        return HttpResponse.json({ items: [room12, room13] });
      }),
    );
    await renderWithSession();
    // um GET ao abrir a tela e outro depois do welcome do socket
    await waitFor(() => expect(calls).toBe(2));
    act(() => publish({ type: "lobby_removed", match_id: 12, reason: "started" }));
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    release();
    expect(await list().findByText("Salões do esgoto")).toBeInTheDocument();
    expect(list().queryByText("Masmorra")).not.toBeInTheDocument();
  });

  it("Entrar leva à sala de espera", async () => {
    const user = userEvent.setup();
    const router = await renderWithSession();
    await list().findByText("Masmorra");
    await user.click(within(roomCards()[0]).getByRole("button", { name: "Entrar" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/lobby/12"));
    expect(await screen.findByRole("heading", { name: "Jogadores (2/5)" })).toBeInTheDocument();
  });

  it("erro ao entrar aparece traduzido", async () => {
    const user = userEvent.setup();
    server.use(
      http.post("/api/matches/:matchId/join", () =>
        HttpResponse.json(
          { error: { code: "room_full", message: "full", request_id: "x", fields: null } },
          { status: 409 },
        )),
    );
    await renderWithSession();
    await list().findByText("Masmorra");
    await user.click(within(roomCards()[0]).getByRole("button", { name: "Entrar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Esta sala está cheia.");
  });
});

describe("criar Room", () => {
  it("mostra os defaults e cria sem mexer em nada, mandando só mode, map e vagas", async () => {
    const user = userEvent.setup();
    let body: unknown = null;
    server.use(
      http.post("/api/matches", async ({ request }) => {
        body = await request.clone().json();
        // sem return: segue para o handler do mock, que cria a Room
      }),
    );
    const router = await renderWithSession();
    const button = await screen.findByRole("button", { name: "Criar sala" });
    await waitFor(() => expect(button).toBeEnabled());
    expect(screen.getByLabelText("Mapa")).toHaveValue("dungeon_map");
    expect(screen.getByLabelText("Jogadores")).toHaveValue("5");
    expect(screen.getByText("HP inicial").nextElementSibling).toHaveTextContent("10");

    await user.click(button);

    await waitFor(() => expect(router.state.location.pathname).toBe("/lobby/100"));
    expect(body).toEqual({ mode: "coop", map: "dungeon_map", max_players: 5 });
    expect(await screen.findByRole("button", { name: "Iniciar partida" })).toBeInTheDocument();
  });

  it("pvp sem Map: avisa e não deixa criar", async () => {
    const user = userEvent.setup();
    await renderWithSession();
    const button = await screen.findByRole("button", { name: "Criar sala" });
    await waitFor(() => expect(button).toBeEnabled());
    await user.selectOptions(screen.getByLabelText("Modo"), "pvp");
    expect(screen.getByText("Ainda não há mapa para este modo.")).toBeInTheDocument();
    expect(button).toBeDisabled();
    // os defaults do pvp aparecem com os limites de abate e de tempo
    expect(screen.getByText("Limite de abates")).toBeInTheDocument();
  });
});
