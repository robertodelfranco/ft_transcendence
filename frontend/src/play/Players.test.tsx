import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import i18n from "../i18n";
import Players from "./Players";

const base = { hp: 10, alive: true, connected: true };
const team = [
  { ...base, id: 9, name: "rdel_fra" },
  { ...base, id: 7, name: "caio" },
  { ...base, id: 3, name: "akita", hp: 0, alive: false },
  { ...base, id: 5, name: "augusto", hp: 4, connected: false },
  { ...base, id: 11, name: "rafael", hp: 0, alive: false, connected: false },
];

beforeEach(async () => {
  await i18n.changeLanguage("pt-BR");
});

describe("Players do coop", () => {
  it("o local vem primeiro e marcado, os outros por id", () => {
    render(<Players players={team} userId={7} />);
    const names = screen.getAllByTitle(/./).map((name) => name.textContent);
    expect(names).toEqual(["caio", "akita", "augusto", "rdel_fra", "rafael"]);
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("(você)");
  });

  it("morto e desconectado são estados independentes", () => {
    render(<Players players={team} userId={7} />);
    const [, akita, augusto, , rafael] = screen.getAllByRole("listitem");
    expect(akita).toHaveTextContent("morto");
    expect(akita).not.toHaveTextContent("desconectado");
    expect(augusto).toHaveTextContent("desconectado");
    expect(augusto).not.toHaveTextContent("morto");
    expect(rafael).toHaveTextContent("morto");
    expect(rafael).toHaveTextContent("desconectado");
  });

  it("HP de cada um em número, sem barra", () => {
    render(<Players players={team} userId={7} />);
    const [, , augusto] = screen.getAllByRole("listitem");
    expect(augusto).toHaveTextContent("Vida 4");
  });
});
