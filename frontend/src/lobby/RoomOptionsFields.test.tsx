import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import type { Mode } from "../api/types";
import i18n from "../i18n";
import RoomOptionsFields from "./RoomOptionsFields";
import { DEFAULT_OPTIONS, toDraft, type OptionErrors, type OptionsDraft } from "./roomOptions";

// O último rascunho que o componente mandou para cima
let latest: OptionsDraft;

// Faz o papel do formulário de criação: guarda o rascunho e devolve ao componente. A cópia em
// `latest` acontece no onChange: gravar fora do componente durante o render a regra do React barra
function Harness({ mode, errors = {} }: { mode: Mode; errors?: OptionErrors }) {
  const [draft, setDraft] = useState(() => toDraft(DEFAULT_OPTIONS[mode]));
  function change(next: OptionsDraft) {
    latest = next;
    setDraft(next);
  }
  return <RoomOptionsFields mode={mode} draft={draft} errors={errors} onChange={change} />;
}

beforeEach(async () => {
  await i18n.changeLanguage("pt-BR");
});

describe("campos das RoomOptions", () => {
  it("o coop mostra os defaults, a dica do limite e nenhum campo do pvp", () => {
    render(<Harness mode="coop" />);
    expect(screen.getByLabelText("Tema")).toHaveValue("dungeon");
    expect(screen.getByLabelText("HP inicial")).toHaveValue(10);
    expect(screen.getByLabelText("HP inicial")).toHaveAccessibleDescription("De 5 a 20.");
    for (const name of ["Poção", "Mana", "Armadura"])
      expect(screen.getByRole("checkbox", { name })).toBeChecked();
    expect(screen.queryByLabelText("Limite de abates")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Tempo limite")).not.toBeInTheDocument();
  });

  it("o pvp acrescenta abates e tempo, com a unidade na dica", () => {
    render(<Harness mode="pvp" />);
    expect(screen.getByLabelText("Limite de abates")).toHaveValue(5);
    expect(screen.getByLabelText("Tempo limite")).toHaveValue(180);
    expect(screen.getByLabelText("Tempo limite")).toHaveAccessibleDescription("De 120 a 600 segundos.");
  });

  it("cada mudança sobe para o rascunho, com os números como texto", async () => {
    const user = userEvent.setup();
    render(<Harness mode="pvp" />);
    await user.selectOptions(screen.getByLabelText("Tema"), "sewer");
    await user.clear(screen.getByLabelText("HP inicial"));
    await user.type(screen.getByLabelText("HP inicial"), "15");
    await user.clear(screen.getByLabelText("Limite de abates"));
    await user.click(screen.getByRole("checkbox", { name: "Armadura" }));

    expect(latest).toEqual({
      theme: "sewer",
      pickups: { potion: true, mana: true, armor: false },
      start_hp: "15",
      frag_limit: "",
      time_limit_s: "180",
    });
  });

  it("o erro aparece no campo e entra na descrição dele", () => {
    render(<Harness mode="pvp" errors={{ frag_limit: "invalid_value" }} />);
    const field = screen.getByLabelText("Limite de abates");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAccessibleDescription("De 3 a 10. Valor inválido.");
    expect(screen.getByLabelText("HP inicial")).toHaveAttribute("aria-invalid", "false");
  });
});
