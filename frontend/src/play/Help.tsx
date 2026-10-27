import { useTranslation } from "react-i18next";
import type { HudState } from "../../game/src/index";
import { linkClass } from "../components/styles";

// Na ordem do game/src/net/input.ts; a tecla e a ação de cada um vêm do i18n
const CONTROLS = ["move", "turn", "mouse", "sprint", "fire", "door", "release"] as const;

// Ajuda da hud.md §6, e as regras e a condição de vitória que o módulo do subject pede na UI.
// O <details> abre e fecha sem estado no React, e o input.ts ignora teclas com foco no <summary>:
// o Espaço abre a ajuda em vez de atirar. A partida não pausa com a ajuda aberta
export default function Help({ mode }: { mode: HudState["mode"] }) {
  const { t } = useTranslation("hud");

  return (
    <details className="pointer-events-auto text-right">
      <summary className={`cursor-pointer ${linkClass}`}>{t("help.title")}</summary>
      <div className="mt-2 flex max-w-xs flex-col gap-2 text-left">
        {mode && <p>{t(`help.goal.${mode}`)}</p>}
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          {CONTROLS.map((control) => (
            <div key={control} className="contents">
              <dt><kbd className="font-bold">{t(`help.controls.${control}.keys`)}</kbd></dt>
              <dd>{t(`help.controls.${control}.action`)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </details>
  );
}
