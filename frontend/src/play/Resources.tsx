import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { HudState } from "../../game/src/index";
import { fraction, isLowHp } from "./bars";

// A barra é só desenho (aria-hidden): o valor acessível é o número ao lado
function Bar({ value, max, className }: { value: number; max: number; className: string }) {
  const part = fraction(value, max);
  if (part === null)
    return null;
  const width = `${part * 100}%`;
  return (
    <div aria-hidden className="h-1 overflow-hidden rounded-full bg-black/40">
      <div className={`h-full rounded-full ${className}`} style={{ width }} />
    </div>
  );
}

function ResourceIcon({ kind }: { kind: "hp" | "mana" | "armor" | "keys" }) {
  const paths = {
    hp: "M12 21 3.5 12.5a5.3 5.3 0 0 1 7.5-7.5L12 6l1-1a5.3 5.3 0 0 1 7.5 7.5Z",
    mana: "M12 2S5 10 5 15a7 7 0 0 0 14 0C19 10 12 2 12 2Z",
    armor: "m12 2 8 3v6c0 5-4 9-8 11-4-2-8-6-8-11V5Zm0 4v12",
    keys: "M14 8a5 5 0 1 1-10 0 5 5 0 0 1 10 0ZM13 12l8 8m-4-4 3-3m-6 0 3-3",
  };
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0">
      <path d={paths[kind]} />
    </svg>
  );
}

function Row({ label, icon, children }: { label: string; icon: "armor" | "keys"; children: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <dt className="flex items-center text-bone/80">
        <span className={icon === "keys" ? "text-torch" : "text-slate-300"}><ResourceIcon kind={icon} /></span>
        <span className="sr-only">{label}</span>
      </dt>
      <dd className="text-xs font-medium tabular-nums text-bone">{children}</dd>
    </div>
  );
}

// Rodapé esquerdo da hud.md §2: recursos do Player local, mesmo quando a câmera acompanha outro
export default function Resources({ hud }: { hud: HudState }) {
  const { t } = useTranslation("hud");
  const low = isLowHp(hud);

  return (
    <dl aria-label={t("stats.label")} className="flex w-44 max-w-full flex-wrap gap-x-5 gap-y-2 sm:w-48">
      <div className="grid w-full grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
        <dt className="flex items-center gap-1.5 text-[11px] text-bone/90">
          <span className="text-red-500"><ResourceIcon kind="hp" /></span>
          {t("stats.hp")}
        </dt>
        <dd className="text-xs font-medium tabular-nums text-red-200">{t("stats.ofMax", { value: hud.hp, max: hud.maxHp })}</dd>
        <dd aria-hidden="true" className="col-span-2"><Bar value={hud.hp} max={hud.maxHp} className="bg-red-600" /></dd>
        {low && <dd className="col-span-2 text-[10px] font-medium text-red-300">{t("stats.lowHp")}</dd>}
      </div>
      <div className="grid w-full grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
        <dt className="flex items-center gap-1.5 text-[11px] text-bone/90">
          <span className="text-sky-400"><ResourceIcon kind="mana" /></span>
          {t("stats.mana")}
        </dt>
        <dd className="text-xs font-medium tabular-nums text-sky-200">{t("stats.ofMax", { value: hud.mana, max: hud.maxMana })}</dd>
        <dd aria-hidden="true" className="col-span-2"><Bar value={hud.mana} max={hud.maxMana} className="bg-sky-500" /></dd>
      </div>
      {/* a dl só aceita div com um par dt/dd: Armadura e Chaves são filhos diretos, lado a lado pelo flex-wrap */}
      <Row label={t("stats.armor")} icon="armor">{hud.armor}</Row>
      <Row label={t("stats.keys")} icon="keys">{hud.keys}</Row>
    </dl>
  );
}
