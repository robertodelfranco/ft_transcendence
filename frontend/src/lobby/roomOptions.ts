import type { TFunction } from "i18next";
import type { Mode, Pickups, RoomOptions, Theme } from "../api/types";
import type { FieldErrorCode } from "../i18n/errorCodes";
import { toFieldErrorCode } from "../i18n/errorMessage";

export const MODES: readonly Mode[] = ["coop", "pvp"];
export const THEMES: readonly Theme[] = ["dungeon", "sewer"];
export const PICKUPS: readonly (keyof Pickups)[] = ["potion", "mana", "armor"];

// Mínimo de Players para o start, como o MIN_PLAYERS do backend (rooms.md "Em aberto" 3)
export const MIN_PLAYERS: Record<Mode, number> = { coop: 1, pvp: 2 };

// Defaults do room-options.md §2, só para mostrar no formulário antes de criar. Quem aplica é o
// servidor (a dataclass RoomOptions); a Room criada traz as opções dela em `options`
export const DEFAULT_OPTIONS: Record<Mode, RoomOptions> = {
  coop: { theme: "dungeon", start_hp: 10, pickups: { potion: true, mana: true, armor: true } },
  pvp: {
    theme: "dungeon", start_hp: 10, pickups: { potion: true, mana: true, armor: true },
    frag_limit: 5, time_limit_s: 180,
  },
};

// Limites do room-options.md §2.1, inteiros e inclusivos, os mesmos do backend
// (app/matches/schemas.py). Se mudarem, mudam no mesmo PR do contrato
export const LIMITS = {
  start_hp: { min: 5, max: 20 },
  frag_limit: { min: 3, max: 10 },
  time_limit_s: { min: 120, max: 600 },
} as const;

export type NumberOption = keyof typeof LIMITS;

// Os campos numéricos de cada Mode. O coop não leva os do pvp: o backend recusaria (extra="forbid")
export const NUMBER_OPTIONS: Record<Mode, readonly NumberOption[]> = {
  coop: ["start_hp"],
  pvp: ["start_hp", "frag_limit", "time_limit_s"],
};

// O que o formulário guarda. Os números ficam como texto: o campo pode estar vazio no meio da
// digitação, e o <input type="number"> devolve "" quando o que foi digitado não é número
export interface OptionsDraft {
  theme: Theme;
  pickups: Pickups;
  start_hp: string;
  frag_limit: string;
  time_limit_s: string;
}

export type OptionErrors = Partial<Record<NumberOption, FieldErrorCode>>;

export function toDraft(options: RoomOptions): OptionsDraft {
  return {
    theme: options.theme,
    pickups: { ...options.pickups },
    start_hp: String(options.start_hp),
    frag_limit: String(options.frag_limit ?? ""),
    time_limit_s: String(options.time_limit_s ?? ""),
  };
}

// Devolve o `code` que o 422 traria em `fields` para o campo, ou null quando o valor passa.
// Number("7.5") não é inteiro; Number("") seria 0, por isso o vazio vem antes
function checkNumber(text: string, option: NumberOption): FieldErrorCode | null {
  if (text === "")
    return "required";
  const value = Number(text);
  const { min, max } = LIMITS[option];
  return Number.isInteger(value) && value >= min && value <= max ? null : "invalid_value";
}

// Só os campos do Mode: no coop, frag_limit e time_limit_s nem são lidos
export function validateDraft(mode: Mode, draft: OptionsDraft): OptionErrors {
  const errors: OptionErrors = {};
  for (const option of NUMBER_OPTIONS[mode]) {
    const code = checkNumber(draft[option], option);
    if (code)
      errors[option] = code;
  }
  return errors;
}

export function hasErrors(errors: OptionErrors): boolean {
  return Object.keys(errors).length > 0;
}

// Do `fields` de um 422, só os números do Mode têm campo no formulário; o resto vira o aviso geral
export function serverOptionErrors(mode: Mode, fields: Record<string, string>): OptionErrors {
  const errors: OptionErrors = {};
  for (const option of NUMBER_OPTIONS[mode]) {
    if (fields[option])
      errors[option] = toFieldErrorCode(fields[option]);
  }
  return errors;
}

// Chamar só depois de validateDraft sem erros
export function draftToOptions(mode: Mode, draft: OptionsDraft): RoomOptions {
  const options: RoomOptions = {
    theme: draft.theme,
    start_hp: Number(draft.start_hp),
    pickups: { ...draft.pickups },
  };
  if (mode === "pvp") {
    options.frag_limit = Number(draft.frag_limit);
    options.time_limit_s = Number(draft.time_limit_s);
  }
  return options;
}

// Map sem tradução mostra o próprio nome do arquivo (i18n.md §2.2)
export function mapName(t: TFunction, map: string): string {
  return t(`game:maps.${map}`, { defaultValue: map });
}
