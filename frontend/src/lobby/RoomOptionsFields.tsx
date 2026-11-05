import { useId } from "react";
import { useTranslation } from "react-i18next";
import type { Mode, Pickups, Theme } from "../api/types";
import { fieldClass } from "../components/styles";
import { fieldErrorMessage } from "../i18n/errorMessage";
import {
  LIMITS, NUMBER_OPTIONS, PICKUPS, THEMES, type NumberOption, type OptionErrors, type OptionsDraft,
} from "./roomOptions";

// Rótulo de cada número: as mesmas chaves da lista da sala de espera (RoomOptionsSummary)
const LABELS: Record<NumberOption, string> = {
  start_hp: "options.startHp",
  frag_limit: "options.fragLimit",
  time_limit_s: "options.timeLimit",
};

// A dica do limite; a do tempo diz a unidade
const HINTS: Record<NumberOption, string> = {
  start_hp: "options.range",
  frag_limit: "options.range",
  time_limit_s: "options.rangeSeconds",
};

interface RoomOptionsFieldsProps {
  mode: Mode;
  draft: OptionsDraft;
  errors: OptionErrors;
  onChange: (draft: OptionsDraft) => void;
}

// Campos controlados: quem guarda o rascunho é o formulário de criação. Cada número mostra o
// limite antes de errar, e o erro fica ligado ao campo por aria-describedby, como no TextField
export default function RoomOptionsFields({ mode, draft, errors, onChange }: RoomOptionsFieldsProps) {
  const { t } = useTranslation("lobby");
  const id = useId();

  function setPickup(item: keyof Pickups, on: boolean) {
    onChange({ ...draft, pickups: { ...draft.pickups, [item]: on } });
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        {t("options.theme")}
        <select
          value={draft.theme}
          onChange={(e) => onChange({ ...draft, theme: e.target.value as Theme })}
          className={fieldClass}
        >
          {THEMES.map((theme) => (
            <option key={theme} value={theme}>{t(`game:themes.${theme}`)}</option>
          ))}
        </select>
      </label>

      {NUMBER_OPTIONS[mode].map((option) => {
        // um useId por componente; o nome da opção separa os campos
        const inputId = `${id}-${option}`;
        const hintId = `${inputId}-hint`;
        const errorId = `${inputId}-error`;
        const error = errors[option];
        return (
          <div key={option} className="flex flex-col gap-1 text-sm">
            <label htmlFor={inputId}>{t(LABELS[option])}</label>
            <input
              id={inputId}
              type="number"
              inputMode="numeric"
              min={LIMITS[option].min}
              max={LIMITS[option].max}
              step={1}
              value={draft[option]}
              onChange={(e) => onChange({ ...draft, [option]: e.target.value })}
              aria-invalid={error !== undefined}
              aria-describedby={error ? `${hintId} ${errorId}` : hintId}
              className={`${fieldClass} aria-invalid:border-red-400`}
            />
            <p id={hintId} className="text-bone/70">{t(HINTS[option], LIMITS[option])}</p>
            {error && (
              <p id={errorId} className="text-red-400">{fieldErrorMessage(t, error)}</p>
            )}
          </div>
        );
      })}

      <fieldset className="flex flex-col gap-2 text-sm">
        <legend>{t("options.pickups")}</legend>
        {PICKUPS.map((item) => (
          <label key={item} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={draft.pickups[item]}
              onChange={(e) => setPickup(item, e.target.checked)}
              className="accent-torch"
            />
            {t(`options.${item}`)}
          </label>
        ))}
      </fieldset>
    </div>
  );
}
