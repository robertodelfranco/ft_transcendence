import { describe, expect, it } from "vitest";
import type { FieldErrorCode } from "../i18n/errorCodes";
import {
  DEFAULT_OPTIONS, draftToOptions, hasErrors, serverOptionErrors, toDraft,
  validateDraft, type NumberOption, type OptionsDraft,
} from "./roomOptions";

type Case = [option: NumberOption, input: string, expected: FieldErrorCode | null];

const pvpDraft = (): OptionsDraft => toDraft(DEFAULT_OPTIONS.pvp);

describe("toDraft", () => {
  it("o coop fica sem os números do pvp", () => {
    expect(toDraft(DEFAULT_OPTIONS.coop)).toEqual({
      theme: "dungeon",
      pickups: { potion: true, mana: true, armor: true },
      start_hp: "10",
      frag_limit: "",
      time_limit_s: "",
    });
  });
});

describe("validateDraft", () => {
  it("os defaults dos dois Modes passam", () => {
    expect(validateDraft("coop", toDraft(DEFAULT_OPTIONS.coop))).toEqual({});
    expect(validateDraft("pvp", pvpDraft())).toEqual({});
  });

  // limites inteiros e inclusivos, como o backend (room-options.md §2.1)
  it.each<Case>([
    ["start_hp", "5", null],
    ["start_hp", "20", null],
    ["start_hp", "4", "invalid_value"],
    ["start_hp", "21", "invalid_value"],
    ["start_hp", "7.5", "invalid_value"],
    ["start_hp", "", "required"],
    ["frag_limit", "3", null],
    ["frag_limit", "10", null],
    ["frag_limit", "2", "invalid_value"],
    ["frag_limit", "11", "invalid_value"],
    ["time_limit_s", "120", null],
    ["time_limit_s", "600", null],
    ["time_limit_s", "119", "invalid_value"],
    ["time_limit_s", "601", "invalid_value"],
  ])("pvp, %s = %j → %s", (option, input, expected) => {
    const errors = validateDraft("pvp", { ...pvpDraft(), [option]: input });
    expect(errors[option] ?? null).toBe(expected);
  });

  it("no coop, os campos do pvp não são conferidos", () => {
    const draft = { ...toDraft(DEFAULT_OPTIONS.coop), frag_limit: "99", time_limit_s: "" };
    expect(validateDraft("coop", draft)).toEqual({});
  });
});

describe("draftToOptions", () => {
  it("o coop sai sem frag_limit e time_limit_s, que o backend recusaria", () => {
    const draft = { ...pvpDraft(), theme: "sewer" as const, start_hp: "15" };
    expect(draftToOptions("coop", draft)).toEqual({
      theme: "sewer",
      start_hp: 15,
      pickups: { potion: true, mana: true, armor: true },
    });
  });

  it("o pvp sai com os três números", () => {
    const draft = { ...pvpDraft(), frag_limit: "7", time_limit_s: "300" };
    expect(draftToOptions("pvp", draft)).toEqual({ ...DEFAULT_OPTIONS.pvp, frag_limit: 7, time_limit_s: 300 });
  });

  it("os Pickups saem copiados: mexer no rascunho depois não muda o que foi enviado", () => {
    const draft = pvpDraft();
    const options = draftToOptions("pvp", draft);
    draft.pickups.armor = false;
    expect(options.pickups.armor).toBe(true);
  });
});

describe("hasErrors", () => {
  it("vazio é sem erro", () => {
    expect(hasErrors({})).toBe(false);
    expect(hasErrors({ start_hp: "required" })).toBe(true);
  });
});

describe("serverOptionErrors", () => {
  // o que o 422 invalid_options traz em `fields` (app/core/errors.py)
  const fields = {
    start_hp: "invalid_value", frag_limit: "invalid_value", theme: "invalid_value", max_players: "invalid_value",
  };

  it("pega só os números do Mode", () => {
    expect(serverOptionErrors("coop", fields)).toEqual({ start_hp: "invalid_value" });
    expect(serverOptionErrors("pvp", fields)).toEqual({ start_hp: "invalid_value", frag_limit: "invalid_value" });
  });

  it("code fora da lista vira invalid_value", () => {
    expect(serverOptionErrors("coop", { start_hp: "greater_than_equal" })).toEqual({ start_hp: "invalid_value" });
  });

  it("sem número do Mode, nada vai para os campos", () => {
    expect(serverOptionErrors("coop", { max_players: "invalid_value" })).toEqual({});
  });
});
