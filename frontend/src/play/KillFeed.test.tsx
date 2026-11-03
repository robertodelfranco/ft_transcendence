import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import i18n from "../i18n";
import KillFeed from "./KillFeed";

const players = [
  { id: 7, name: "caio", hp: 10, alive: true, connected: true },
  { id: 9, name: "rdel_fra", hp: 10, alive: true, connected: true },
];

beforeEach(async () => {
  await i18n.changeLanguage("pt-BR");
});

describe("kill feed do pvp", () => {
  it("seis mortes mostram as cinco mais recentes, a última primeiro", () => {
    const killfeed = [1, 2, 3, 4, 5, 6].map((tick) => ({ by: 7, victim: 9, tick }));
    killfeed[5] = { by: 9, victim: 7, tick: 6 };
    render(<KillFeed killfeed={killfeed} players={players} />);
    const lines = screen.getAllByRole("listitem");
    expect(lines).toHaveLength(5);
    expect(lines[0]).toHaveTextContent("rdel_fra fez um Frag em caio");
  });

  it("registros iguais continuam distintos", () => {
    const killfeed = [{ by: 7, victim: 9, tick: 10 }, { by: 7, victim: 9, tick: 20 }];
    render(<KillFeed killfeed={killfeed} players={players} />);
    expect(screen.getAllByText("caio fez um Frag em rdel_fra")).toHaveLength(2);
  });

  it("sem atacante, mensagem neutra", () => {
    render(<KillFeed killfeed={[{ by: null, victim: 9, tick: 3 }]} players={players} />);
    expect(screen.getByRole("listitem")).toHaveTextContent("rdel_fra morreu.");
  });

  it("feed vazio não desenha nada", () => {
    const { container } = render(<KillFeed killfeed={[]} players={players} />);
    expect(container).toBeEmptyDOMElement();
  });
});
