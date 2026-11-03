import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import i18n from "../i18n";
import Help from "./Help";

beforeEach(async () => {
  await i18n.changeLanguage("pt-BR");
});

describe("ajuda de controles", () => {
  it("fechada por padrão, abre pelo resumo", async () => {
    const user = userEvent.setup();
    render(<Help mode="coop" />);
    expect(screen.getByText("Atirar")).not.toBeVisible();
    await user.click(screen.getByText("Controles e objetivo"));
    expect(screen.getByText("Atirar")).toBeVisible();
  });

  it("lista as teclas do input.ts, cada uma com a sua ação", () => {
    render(<Help mode="coop" />);
    const keys = screen.getAllByRole("term", { hidden: true }).map((term) => term.textContent);
    const actions = screen.getAllByRole("definition", { hidden: true }).map((item) => item.textContent);
    expect(keys).toEqual(["W A S D", "← →", "Mouse", "Shift", "Espaço", "F", "Esc"]);
    expect(actions[keys.indexOf("Espaço")]).toBe("Atirar");
    expect(actions[keys.indexOf("F")]).toBe("Abrir porta");
  });

  it("coop: o objetivo é o Boss, sem respawn", () => {
    render(<Help mode="coop" />);
    expect(screen.getByText(/derrotar o Boss/)).toHaveTextContent("não há respawn");
  });

  it("pvp: o objetivo é por Frags e tempo", () => {
    render(<Help mode="pvp" />);
    expect(screen.getByText(/limite de Frags/)).toHaveTextContent("quando o tempo acabar");
  });

  it("sem Mode conhecido, só os controles", () => {
    render(<Help mode={null} />);
    expect(screen.queryByText(/Objetivo/)).not.toBeInTheDocument();
  });
});