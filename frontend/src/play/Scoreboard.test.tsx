import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import i18n from "../i18n";
import { hudState } from "../mocks/game";
import Scoreboard from "./Scoreboard";

const players = [
  { id: 7, name: "caio", hp: 10, alive: true, connected: true },
  { id: 9, name: "rdel_fra", hp: 10, alive: true, connected: true },
];

beforeEach(async () => {
  await i18n.changeLanguage("pt-BR");
});

describe("placar do pvp", () => {
  it("segue a ordem do scoreboard, não a dos ids", () => {
    const scoreboard = { players: [{ id: 9, frags: 4 }, { id: 7, frags: 2 }], timeLeftS: 90 };
    render(<Scoreboard hud={hudState({ mode: "pvp", players, scoreboard })} userId={7} />);
    const [first, second] = screen.getAllByRole("listitem");
    expect(first).toHaveTextContent("rdel_fra");
    expect(first).toHaveTextContent("Frags: 4");
    expect(second).toHaveTextContent("caio(você)");
  });

  it("relógio em mm:ss vindo do Snapshot", () => {
    const scoreboard = { players: [], timeLeftS: 124.3 };
    render(<Scoreboard hud={hudState({ mode: "pvp", scoreboard })} userId={7} />);
    expect(screen.getByText("02:05")).toBeInTheDocument();
  });

  it("sem scoreboard diz indisponível, nunca 0 × 0", () => {
    render(<Scoreboard hud={hudState({ mode: "pvp", scoreboard: null })} userId={7} />);
    expect(screen.getByText("Placar indisponível")).toBeInTheDocument();
    expect(screen.queryByText(/Frags/)).not.toBeInTheDocument();
  });

  it("Player fora da lista aparece pelo id, com nome traduzido", () => {
    const scoreboard = { players: [{ id: 12, frags: 1 }], timeLeftS: 60 };
    render(<Scoreboard hud={hudState({ mode: "pvp", players, scoreboard })} userId={7} />);
    expect(screen.getByText("Jogador #12")).toBeInTheDocument();
  });
});
