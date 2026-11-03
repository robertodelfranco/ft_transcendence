import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import i18n from "../i18n";
import { hudState } from "../mocks/game";
import Hud from "./Hud";

const STALE = "Valores de antes da queda da conexão.";

beforeEach(async () => {
  await i18n.changeLanguage("pt-BR");
});

function stats() {
  return screen.getByLabelText("Seu estado");
}

describe("recursos do Player local", () => {
  it("HP e Mana aparecem como atual/máximo", () => {
    render(<Hud userId={7} hud={hudState({ hp: 7, maxHp: 10, mana: 40, maxMana: 100 })} />);
    expect(within(stats()).getByText("7/10")).toBeInTheDocument();
    expect(within(stats()).getByText("40/100")).toBeInTheDocument();
  });

  it("Armor e chaves zerados aparecem como 0", () => {
    render(<Hud userId={7} hud={hudState({ armor: 0, keys: 0 })} />);
    expect(within(stats()).getAllByText("0")).toHaveLength(2);
  });

  it("HP no limiar ganha rótulo, não só cor", () => {
    render(<Hud userId={7} hud={hudState({ hp: 25, maxHp: 100 })} />);
    expect(within(stats()).getByText("Vida baixa")).toBeInTheDocument();
  });

  it("acima do limiar não tem rótulo", () => {
    render(<Hud userId={7} hud={hudState({ hp: 26, maxHp: 100 })} />);
    expect(screen.queryByText("Vida baixa")).not.toBeInTheDocument();
  });
});

describe("ping", () => {
  it("null aparece como traço com descrição, nunca como 0 ms", () => {
    render(<Hud userId={7} hud={hudState({ ping: null })} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("indisponível")).toBeInTheDocument();
    expect(screen.queryByText(/ms$/)).not.toBeInTheDocument();
  });

  it("mostra o RTT inteiro em ms", () => {
    render(<Hud userId={7} hud={hudState({ ping: 41.6 })} />);
    expect(screen.getByText("42 ms")).toBeInTheDocument();
  });
});

describe("conexão perdida", () => {
  it("avisa a reconexão, marca os valores como desatualizados e mantém os números", () => {
    render(<Hud userId={7} hud={hudState({ status: "disconnected", hp: 7, maxHp: 10 })} />);
    expect(screen.getByRole("status")).toHaveTextContent("Conexão perdida. Reconectando…");
    expect(screen.getByText(STALE)).toBeInTheDocument();
    expect(within(stats()).getByText("7/10")).toBeInTheDocument();
  });

  it("running não tem a marca", () => {
    render(<Hud userId={7} hud={hudState()} />);
    expect(screen.queryByText(STALE)).not.toBeInTheDocument();
  });
});

describe("aviso de morte", () => {
  it("coop: aguarda o fim da partida, sem respawn", () => {
    render(<Hud userId={7} hud={hudState({ alive: false, hp: 0, mode: "coop" })} />);
    expect(screen.getByRole("status")).toHaveTextContent("Você morreu. Aguardando o fim da partida.");
  });

  it("pvp: aguarda o respawn, sem contagem regressiva", () => {
    render(<Hud userId={7} hud={hudState({ alive: false, hp: 0, mode: "pvp" })} />);
    expect(screen.getByRole("status")).toHaveTextContent("Você morreu. Aguardando respawn.");
  });

  it("o aviso some quando o servidor diz que voltou a viver", () => {
    const { rerender } = render(<Hud userId={7} hud={hudState({ alive: false, hp: 0, mode: "pvp" })} />);
    rerender(<Hud userId={7} hud={hudState({ alive: true, mode: "pvp" })} />);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("os recursos continuam os do Player local durante a espera", () => {
    render(<Hud userId={7} hud={hudState({ alive: false, hp: 0, maxHp: 10, mode: "coop" })} />);
    expect(within(stats()).getByText("0/10")).toBeInTheDocument();
  });
});

describe("topo esquerdo por Mode", () => {
  const players = [{ id: 7, name: "caio", hp: 10, alive: true, connected: true }];

  it("coop mostra a lista de Players", () => {
    render(<Hud userId={7} hud={hudState({ mode: "coop", players })} />);
    expect(screen.getByRole("list", { name: "Jogadores" })).toBeInTheDocument();
  });

  it("pvp não mostra a lista de Players", () => {
    render(<Hud userId={7} hud={hudState({ mode: "pvp", players })} />);
    expect(screen.queryByRole("list", { name: "Jogadores" })).not.toBeInTheDocument();
  });
});

describe("pvp", () => {
  const players = [
    { id: 7, name: "caio", hp: 10, alive: true, connected: true },
    { id: 9, name: "rdel_fra", hp: 10, alive: true, connected: true },
  ];
  const scoreboard = { players: [{ id: 7, frags: 3 }, { id: 9, frags: 1 }], timeLeftS: 61 };
  const killfeed = [{ by: 7, victim: 9, tick: 40 }];

  it("mostra placar, relógio e feed", () => {
    render(<Hud userId={7} hud={hudState({ mode: "pvp", players, scoreboard, killfeed })} />);
    expect(screen.getByRole("list", { name: "Placar" })).toBeInTheDocument();
    expect(screen.getByText("01:01")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Últimos Frags" })).toHaveTextContent(
      "caio fez um Frag em rdel_fra",
    );
  });

  it("coop não tem placar nem feed", () => {
    render(<Hud userId={7} hud={hudState({ mode: "coop", players, killfeed })} />);
    expect(screen.queryByRole("list", { name: "Placar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Últimos Frags" })).not.toBeInTheDocument();
  });
});

describe("ajuda", () => {
  it.each(["coop", "pvp"] as const)("aparece no %s, sobre o jogo e clicável", (mode) => {
    render(<Hud userId={7} hud={hudState({ mode })} />);
    const summary = screen.getByText("Controles e objetivo");
    expect(summary.closest("details")).toHaveClass("pointer-events-auto");
  });
});

// Em janela estreita os grupos ficam um sob o outro, na ordem do DOM; é também a ordem de leitura
it("a ordem do DOM segue a prioridade da hud.md §2", () => {
  const players = [{ id: 7, name: "caio", hp: 10, alive: true, connected: true }];
  render(<Hud userId={7} hud={hudState({ mode: "coop", players })} />);
  const order = [
    screen.getByRole("status"),
    screen.getByLabelText("Seu estado"),
    screen.getByRole("list", { name: "Jogadores" }),
    screen.getByText("Controles e objetivo"),
  ];
  for (const [index, element] of order.slice(1).entries())
    expect(order[index].compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
