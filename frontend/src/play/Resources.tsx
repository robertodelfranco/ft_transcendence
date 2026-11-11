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
    <div aria-hidden className="h-2 w-32 overflow-hidden rounded bg-crypt-700">
      <div className={`h-full ${className}`} style={{ width }} />
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <dt className="w-24 text-bone/70">{label}</dt>
      <dd className="flex items-center gap-2 font-bold">{children}</dd>
    </div>
  );
}

// Rodapé esquerdo da hud.md §2: recursos do Player local, mesmo quando a câmera acompanha outro
export default function Resources({ hud }: { hud: HudState }) {
  const { t } = useTranslation("hud");
  const low = isLowHp(hud);

  return (
    <dl aria-label={t("stats.label")} className="flex flex-col gap-1">
      <Row label={t("stats.hp")}>
        <Bar value={hud.hp} max={hud.maxHp} className={low ? "bg-blood" : "bg-bone"} />
        {t("stats.ofMax", { value: hud.hp, max: hud.maxHp })}
        {low && <span className="rounded bg-blood px-1 text-bone">{t("stats.lowHp")}</span>}
      </Row>
      <Row label={t("stats.mana")}>
        <Bar value={hud.mana} max={hud.maxMana} className="bg-sky-400" />
        {t("stats.ofMax", { value: hud.mana, max: hud.maxMana })}
      </Row>
      <Row label={t("stats.armor")}>{hud.armor}</Row>
      <Row label={t("stats.keys")}>{hud.keys}</Row>
    </dl>
  );
}