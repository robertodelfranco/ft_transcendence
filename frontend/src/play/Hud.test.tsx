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
    render(<Hud hud={hudState({ hp: 7, maxHp: 10, mana: 40, maxMana: 100 })} />);
    expect(within(stats()).getByText("7/10")).toBeInTheDocument();
    expect(within(stats()).getByText("40/100")).toBeInTheDocument();
  });

  it("Armor e chaves zerados aparecem como 0", () => {
    render(<Hud hud={hudState({ armor: 0, keys: 0 })} />);
    expect(within(stats()).getAllByText("0")).toHaveLength(2);
  });

  it("HP no limiar ganha rótulo, não só cor", () => {
    render(<Hud hud={hudState({ hp: 25, maxHp: 100 })} />);
    expect(within(stats()).getByText("Vida baixa")).toBeInTheDocument();
  });

  it("acima do limiar não tem rótulo", () => {
    render(<Hud hud={hudState({ hp: 26, maxHp: 100 })} />);
    expect(screen.queryByText("Vida baixa")).not.toBeInTheDocument();
  });
});

describe("ping", () => {
  it("null aparece como traço com descrição, nunca como 0 ms", () => {
    render(<Hud hud={hudState({ ping: null })} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("indisponível")).toBeInTheDocument();
    expect(screen.queryByText(/ms$/)).not.toBeInTheDocument();
  });

  it("mostra o RTT inteiro em ms", () => {
    render(<Hud hud={hudState({ ping: 41.6 })} />);
    expect(screen.getByText("42 ms")).toBeInTheDocument();
  });
});

describe("conexão perdida", () => {
  it("marca os valores como desatualizados e mantém os números", () => {
    render(<Hud hud={hudState({ status: "disconnected", hp: 7, maxHp: 10 })} />);
    expect(screen.getByText(STALE)).toBeInTheDocument();
    expect(within(stats()).getByText("7/10")).toBeInTheDocument();
  });

  it("running não tem a marca", () => {
    render(<Hud hud={hudState()} />);
    expect(screen.queryByText(STALE)).not.toBeInTheDocument();
  });
});
