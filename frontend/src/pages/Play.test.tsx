import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../api/client";
import { setAccessToken } from "../auth/token";
import i18n from "../i18n";
import { activeMount, emitEnd, emitHud, failNextMount, mounts } from "../mocks/game";
import { MOCK_PASSWORD } from "../mocks/handlers";
import { server } from "../mocks/server";
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

describe("rodapé", () => {
  // i18n.md §2.4: os links legais aparecem em toda página, inclusive a do jogo
  it("a página do jogo também mostra Privacy e Terms", async () => {
    await renderAt("/play/13");
    await mounted();
    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getByRole("link", { name: "Política de Privacidade" })).toHaveAttribute("href", "/privacy");
    expect(within(footer).getByRole("link", { name: "Termos de Serviço" })).toHaveAttribute("href", "/terms");
  });
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
    // a navegação é uma transição: o /play fica na tela até o chunk da página legal chegar,
    // e o primeiro carregamento do chunk na suíte pode passar de 1 s
    await waitFor(() => expect(game.unmounted).toBe(true), { timeout: 3000 });
  });

  // Regressão: o minimapa é absolute e se ancora ao pai dele. Abaixo do md o HUD vem depois do
  // canvas, no fluxo; com o HUD no mesmo bloco, o minimapa parava em cima dos recursos. O jsdom não
  // faz layout, então o teste trava a causa (quem divide o bloco), não a posição na tela
  it("o minimapa divide o bloco com o canvas, e o HUD fica fora dele", async () => {
    await renderAt("/play/13");
    const game = await mounted();
    act(() => emitHud({ mode: "coop" }));
    const block = game.options.minimapCanvas!.parentElement!;
    expect(block).toContainElement(game.canvas);
    expect(block).not.toContainElement(await screen.findByText("Mana"));
  });

  it("trocar de partida desmonta a velha e monta a nova", async () => {
    const router = await renderAt("/play/13");
    const old = await mounted();
    await act(() => router.navigate("/play/14"));
    await waitFor(() => expect(activeMount()?.options.matchId).toBe(14));
    expect(old.unmounted).toBe(true);
  });

  it.each([
    "/play/abc",
    "/play/0",
    "/play/0x10",
    "/play/1e1",
    "/play/99999999999999999999",
    `/play/${"9".repeat(400)}`,
  ])("%s não monta nada", async (path) => {
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

  it("coop põe o User da sessão no topo da lista de Players", async () => {
    await renderAt("/play/13");
    await mounted();
    act(() => emitHud({ players: [
      { id: 9, name: "rdel_fra", hp: 10, alive: true, connected: true },
      { id: 7, name: "caio", hp: 8, alive: true, connected: true },
    ] }));
    const list = await screen.findByRole("list", { name: "Jogadores" });
    expect(within(list).getAllByRole("listitem")[0]).toHaveTextContent("caio(você)");
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
    expect(screen.queryByRole("link", { name: "Ver resultado" })).not.toBeInTheDocument();
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
    expect(screen.getByRole("link", { name: "Ver resultado" })).toHaveAttribute("href", "/matches/13");
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
    expect(screen.getByRole("link", { name: "Ver resultado" })).toHaveAttribute("href", "/matches/13");
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

  it("Ver resultado abre o Match gravado e desmonta o jogo", async () => {
    const user = userEvent.setup();
    await renderAt("/play/14");
    const game = await mounted();
    act(() => {
      emitHud({ status: "finished" });
      emitEnd({ result: "win", winnerIds: [7, 9], reason: "boss_defeated" });
    });
    await user.click(await screen.findByRole("link", { name: "Ver resultado" }));
    expect(await screen.findByRole("heading", { name: "Partida #14" })).toBeInTheDocument();
    expect(game.unmounted).toBe(true);
  });
});


describe("Sair da partida (#240)", () => {
  // a Room 13 do mock está em lobby e sem o User 7: cada teste diz o que o servidor responde
  function answerLeave(response: () => Response) {
    const calls: string[] = [];
    server.use(http.post("/api/matches/:matchId/leave", ({ params }) => {
      calls.push(String(params.matchId));
      return response();
    }));
    return calls;
  }

  const failure = (status: number, code: string) => () => HttpResponse.json(
    { error: { code, message: code, request_id: "mock0001", fields: null } }, { status });

  it("confirma, avisa o servidor, desmonta o jogo e volta ao lobby", async () => {
    const user = userEvent.setup();
    const calls = answerLeave(() => new HttpResponse(null, { status: 204 }));
    const router = await renderAt("/play/13");
    const game = await mounted();
    act(() => emitHud());
    await user.click(await screen.findByRole("button", { name: "Sair da partida" }));
    expect(calls).toEqual([]); // o primeiro clique só pergunta
    expect(screen.getByText("Sair da partida? Você não poderá voltar a ela.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Sim, sair" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/lobby"));
    expect(calls).toEqual(["13"]);
    // o router muda antes de o React desmontar a página: o unmount do jogo chega logo depois
    await waitFor(() => expect(game.unmounted).toBe(true));
  });

  it("Continuar jogando desiste sem chamar o servidor", async () => {
    const user = userEvent.setup();
    const calls = answerLeave(() => new HttpResponse(null, { status: 204 }));
    await renderAt("/play/13");
    await mounted();
    act(() => emitHud());
    await user.click(await screen.findByRole("button", { name: "Sair da partida" }));
    await user.click(screen.getByRole("button", { name: "Continuar jogando" }));
    expect(screen.getByRole("button", { name: "Sair da partida" })).toBeInTheDocument();
    expect(calls).toEqual([]);
  });

  it("falha na saída aparece traduzida e o jogo continua", async () => {
    const user = userEvent.setup();
    answerLeave(failure(409, "not_in_match"));
    const router = await renderAt("/play/13");
    const game = await mounted();
    act(() => emitHud());
    await user.click(await screen.findByRole("button", { name: "Sair da partida" }));
    await user.click(screen.getByRole("button", { name: "Sim, sair" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Você não está nesta partida.");
    expect(router.state.location.pathname).toBe("/play/13");
    expect(game.unmounted).toBe(false);
    expect(screen.getByRole("button", { name: "Sair da partida" })).toBeInTheDocument();
  });

  it("Room que já sumiu (404) também volta ao lobby", async () => {
    const user = userEvent.setup();
    answerLeave(failure(404, "match_not_found"));
    const router = await renderAt("/play/13");
    await mounted();
    act(() => emitHud());
    await user.click(await screen.findByRole("button", { name: "Sair da partida" }));
    await user.click(screen.getByRole("button", { name: "Sim, sair" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/lobby"));
  });

  it("o close 1000 que chega durante a saída não mostra a tela de fim", async () => {
    const user = userEvent.setup();
    let release: () => void = () => {};
    server.use(http.post("/api/matches/:matchId/leave", () =>
      new Promise<Response>((resolve) => {
        release = () => resolve(new HttpResponse(null, { status: 204 }));
      })));
    const router = await renderAt("/play/13");
    await mounted();
    act(() => emitHud());
    await user.click(await screen.findByRole("button", { name: "Sair da partida" }));
    await user.click(screen.getByRole("button", { name: "Sim, sair" }));
    expect(await screen.findByRole("button", { name: "Saindo…" })).toBeDisabled();
    act(() => emitHud({ status: "finished" }));
    expect(screen.queryByText("A partida terminou.")).not.toBeInTheDocument();
    act(() => release());
    await waitFor(() => expect(router.state.location.pathname).toBe("/lobby"));
  });

  it.each(["connecting", "finished", "error"] as const)("não aparece com status %s", async (status) => {
    await renderAt("/play/13");
    await mounted();
    if (status !== "connecting")
      act(() => emitHud(status === "error" ? { status, error: "replaced" } : { status }));
    expect(screen.queryByRole("button", { name: "Sair da partida" })).not.toBeInTheDocument();
  });
});

describe("contagem do início (#255)", () => {
  // o que o leitor de tela ouve: a região de status da contagem, entre as outras da página
  const announced = (text: string) =>
    screen.getAllByRole("status").some((region) => region.textContent === text);

  it("esperando os Players, a camada cobre o canvas e avisa", async () => {
    await renderAt("/play/13");
    const game = await mounted();
    act(() => emitHud({ countdown: "waiting" }));
    const block = game.canvas.parentElement!;
    // o texto visível, sem contar a região de status, que também fica no bloco
    const shown = within(block).getAllByText("Aguardando jogadores…")
      .filter((element) => element.getAttribute("role") !== "status");
    expect(shown).toHaveLength(1);
    expect(announced("Aguardando jogadores…")).toBe(true);
  });

  it("mostra 3, 2, 1 e anuncia cada número", async () => {
    await renderAt("/play/13");
    const game = await mounted();
    const block = game.canvas.parentElement!;
    for (const seconds of [3, 2, 1]) {
      act(() => emitHud({ countdown: seconds }));
      expect(within(block).getByText(String(seconds))).toBeInTheDocument();
      expect(announced(`A partida começa em ${seconds}`)).toBe(true);
    }
  });

  it("a mira some na espera e na contagem, e volta com a partida valendo", async () => {
    await renderAt("/play/13");
    const game = await mounted();
    // no bloco do canvas, a mira é o único svg: os ícones da HUD ficam fora dele
    const block = game.canvas.parentElement!;
    for (const countdown of ["waiting", 3] as const) {
      act(() => emitHud({ countdown }));
      expect(block.querySelector("svg")).toBeNull();
    }
    act(() => emitHud({ countdown: null }));
    expect(block.querySelector("svg")).not.toBeNull();
  });

  it("com a partida valendo, a camada some", async () => {
    await renderAt("/play/13");
    const game = await mounted();
    act(() => emitHud({ countdown: 1 }));
    act(() => emitHud({ countdown: null }));
    const block = game.canvas.parentElement!;
    expect(within(block).queryByText("1")).not.toBeInTheDocument();
    expect(announced("A partida começa em 1")).toBe(false);
  });
});

describe("modo partida (#254)", () => {
  it("o layout fica compacto e o título sai da tela, mas continua para leitor de tela", async () => {
    await renderAt("/play/13");
    await mounted();
    expect(document.querySelector("[data-layout]")).toHaveAttribute("data-layout", "compact");
    expect(screen.getByRole("heading", { level: 1, name: "Partida" })).toHaveClass("sr-only");
  });
});

describe("tela cheia (#254)", () => {
  const original = Object.getOwnPropertyDescriptor(Document.prototype, "fullscreenEnabled");

  // o jsdom não tem a Fullscreen API: cada teste diz se o navegador a oferece e o que ela responde
  function offerFullscreen(request: () => Promise<void>) {
    Object.defineProperty(document, "fullscreenEnabled", { value: true, configurable: true });
    const spy = vi.fn(request);
    HTMLElement.prototype.requestFullscreen = spy;
    return spy;
  }

  afterEach(() => {
    delete (document as { fullscreenEnabled?: boolean }).fullscreenEnabled;
    if (original)
      Object.defineProperty(Document.prototype, "fullscreenEnabled", original);
    delete (HTMLElement.prototype as { requestFullscreen?: unknown }).requestFullscreen;
  });

  it("sem a Fullscreen API, o botão não aparece", async () => {
    await renderAt("/play/13");
    await mounted();
    act(() => emitHud());
    expect(await screen.findByRole("button", { name: "Sair da partida" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tela cheia" })).not.toBeInTheDocument();
  });

  it("leva para a tela cheia o canvas com a HUD, sem os botões de baixo", async () => {
    const user = userEvent.setup();
    const request = offerFullscreen(() => Promise.resolve());
    await renderAt("/play/13");
    const game = await mounted();
    act(() => emitHud());
    await user.click(await screen.findByRole("button", { name: "Tela cheia" }));

    expect(request).toHaveBeenCalledTimes(1);
    const stage = request.mock.contexts[0] as HTMLElement;
    expect(stage).toContainElement(game.canvas);
    expect(stage).toContainElement(screen.getByText("Mana"));
    expect(stage).not.toContainElement(screen.getByRole("button", { name: "Sair da partida" }));
  });

  it("o navegador recusar a tela cheia não vira erro, e o jogo segue", async () => {
    const user = userEvent.setup();
    const request = offerFullscreen(() => Promise.reject(new TypeError("Permissions check failed")));
    await renderAt("/play/13");
    await mounted();
    act(() => emitHud());
    await user.click(await screen.findByRole("button", { name: "Tela cheia" }));

    expect(request).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Tela cheia" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("some junto com o botão de sair enquanto confirma a saída", async () => {
    const user = userEvent.setup();
    offerFullscreen(() => Promise.resolve());
    await renderAt("/play/13");
    await mounted();
    act(() => emitHud());
    await user.click(await screen.findByRole("button", { name: "Sair da partida" }));
    expect(screen.queryByRole("button", { name: "Tela cheia" })).not.toBeInTheDocument();
  });
});
