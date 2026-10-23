import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { beforeEach, describe, expect, it } from "vitest";
import { apiFetch } from "../api/client";
import { setAccessToken } from "../auth/token";
import i18n from "../i18n";
import { activeMount, emitEnd, emitHud, failNextMount, mounts } from "../mocks/game";
import { MOCK_PASSWORD } from "../mocks/handlers";
import { routes } from "../routes";
import { socketToken } from "../auth/socketToken";

// Login no mock e depois "recarrega" na rota pedida. O perfil do mock é pt-BR, e o User é o 7
async function renderAt(path: string) {
  await apiFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "a@b.c", password: MOCK_PASSWORD }),
  });
  setAccessToken(null);
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

// o import do jogo é assíncrono: espera a montagem chegar
async function mounted() {
  await waitFor(() => expect(activeMount()).toBeDefined());
  return activeMount()!;
}

beforeEach(async () => {
  localStorage.clear();
  setAccessToken(null);
  await i18n.changeLanguage("en");
});

describe("montagem do jogo", () => {
  it("monta uma vez no canvas, com o matchId da URL", async () => {
    await renderAt("/play/13");
    const game = await mounted();
    expect(mounts).toHaveLength(1);
    expect(game.options.matchId).toBe(13);
    expect(game.canvas).toBe(await screen.findByLabelText("Visão do jogo"));
    expect(screen.getByText("Conectando à partida #13…")).toBeInTheDocument();
  });

  it("desmonta ao sair da página", async () => {
    const router = await renderAt("/play/13");
    const game = await mounted();
    await act(() => router.navigate("/privacy"));
    expect(game.unmounted).toBe(true);
  });

  it("trocar de partida desmonta a velha e monta a nova", async () => {
    const router = await renderAt("/play/13");
    const old = await mounted();
    await act(() => router.navigate("/play/14"));
    await waitFor(() => expect(activeMount()?.options.matchId).toBe(14));
    expect(old.unmounted).toBe(true);
  });

  it.each(["/play/abc", "/play/0", "/play/0x10", "/play/1e1"])("%s não monta nada", async (path) => {
    await renderAt(path);
    expect(await screen.findByText("Esta partida não existe mais.")).toBeInTheDocument();
    expect(mounts).toHaveLength(0);
  });

  it("falha ao carregar o jogo vira erro traduzido", async () => {
    failNextMount();
    await renderAt("/play/13");
    expect(await screen.findByText(
      "Não foi possível carregar os arquivos do jogo. Recarregue a página.",
    )).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Voltar ao lobby" })).toBeInTheDocument();
  });

  it("passa ao jogo o token do helper comum aos dois sockets", async () => {
    await renderAt("/play/13");
    const game = await mounted();
    expect(game.options.getAccessToken).toBe(socketToken);
  });
});

describe("status da partida", () => {
  it("running mostra a HUD mínima", async () => {
    await renderAt("/play/13");
    await mounted();
    act(() => emitHud({ hp: 7, maxHp: 10, mana: 40, maxMana: 100, armor: 2, keys: 1 }));
    const stats = await screen.findByLabelText("Seu estado");
    expect(within(stats).getByText("7/10")).toBeInTheDocument();
    expect(within(stats).getByText("40/100")).toBeInTheDocument();
    expect(within(stats).getByText("2")).toBeInTheDocument();
    expect(within(stats).getByText("1")).toBeInTheDocument();
    expect(screen.queryByText("Conectando à partida #13…")).not.toBeInTheDocument();
  });

  it("disconnected avisa que está reconectando e mantém a HUD", async () => {
    await renderAt("/play/13");
    await mounted();
    act(() => emitHud({ status: "disconnected" }));
    expect(await screen.findByText("Conexão perdida. Reconectando…")).toBeInTheDocument();
    expect(screen.getByLabelText("Seu estado")).toBeInTheDocument();
  });

  it("error traduz o code e oferece a volta ao lobby", async () => {
    await renderAt("/play/13");
    await mounted();
    act(() => emitHud({ status: "error", error: "replaced" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Você abriu o jogo em outra aba ou dispositivo.",
    );
    expect(screen.getByRole("link", { name: "Voltar ao lobby" })).toBeInTheDocument();
  });

  it("code desconhecido não aparece cru", async () => {
    await renderAt("/play/13");
    await mounted();
    act(() => emitHud({ status: "error", error: "meteoro" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Algo deu errado.");
  });

  it("finished sem onEnd diz que acabou", async () => {
    await renderAt("/play/13");
    await mounted();
    act(() => emitHud({ status: "finished" }));
    expect(await screen.findByText("A partida terminou.")).toBeInTheDocument();
  });

  it("Tentar de novo remonta o jogo", async () => {
    const user = userEvent.setup();
    await renderAt("/play/13");
    const old = await mounted();
    act(() => emitHud({ status: "error", error: "replaced" }));
    await user.click(await screen.findByRole("button", { name: "Tentar de novo" }));
    await waitFor(() => expect(mounts).toHaveLength(2));
    expect(old.unmounted).toBe(true);
    expect(activeMount()?.options.matchId).toBe(13);
    expect(await screen.findByText("Conectando à partida #13…")).toBeInTheDocument();
  });
});

describe("fim da partida", () => {
  async function ended(result: Parameters<typeof emitEnd>[0]) {
    await renderAt("/play/13");
    await mounted();
    act(() => {
      emitHud({ status: "finished" });
      emitEnd(result);
    });
  }

  it("vitória no coop", async () => {
    await ended({ result: "win", winnerIds: [7, 9], reason: "boss_defeated" });
    expect(await screen.findByText("Vitória!")).toBeInTheDocument();
    expect(screen.getByText("O Boss foi derrotado.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Voltar ao lobby" })).toBeInTheDocument();
    expect(screen.queryByText("A partida terminou.")).not.toBeInTheDocument();
  });

  // o result é o da Room: no pvp chega "win" também para quem perdeu
  it("no pvp, win da Room sem o próprio id é derrota", async () => {
    await ended({ result: "win", winnerIds: [9], reason: "frag_limit" });
    expect(await screen.findByText("Derrota")).toBeInTheDocument();
  });

  it("empate", async () => {
    await ended({ result: "draw", winnerIds: [], reason: "time_limit" });
    expect(await screen.findByText("Empate")).toBeInTheDocument();
    expect(screen.getByText("O tempo acabou.")).toBeInTheDocument();
  });

  it("reason desconhecido some, sem chave crua", async () => {
    await ended({ result: "loss", winnerIds: [], reason: "meteoro" });
    expect(await screen.findByText("Derrota")).toBeInTheDocument();
    expect(screen.queryByText(/reasons/)).not.toBeInTheDocument();
  });
});
