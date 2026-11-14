import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { HudState } from "../../game/src/index";
import { fraction, isLowHp } from "./bars";

// Os mesmos sprites do Pickup na cena: a HUD mostra o que o Player coleta no chão
const ICONS = {
  hp: "/assets/collectables/pot.png",
  mana: "/assets/collectables/mana.png",
  armor: "/assets/collectables/armor.png",
  keys: "/assets/collectables/key.png",
} as const;

// Quanto dura a piscada da Armadura absorvendo golpe; o CSS anima nesse tempo (.hud-hit)
const ARMOR_HIT_MS = 400;

// Decorativo: alt vazio, e o valor acessível é o número ao lado
function ResourceIcon({ kind }: { kind: keyof typeof ICONS }) {
  return (
    <span className="hud-icon">
      <img src={ICONS[kind]} alt="" width={64} height={64} draggable={false} />
    </span>
  );
}

// A barra é só desenho (aria-hidden): o valor acessível é o número ao lado
function Bar({ value, max, kind, low = false }: { value: number; max: number; kind: "hp" | "mana"; low?: boolean }) {
  const part = fraction(value, max);
  if (part === null)
    return null;
  return (
    <div aria-hidden className="hud-bar" data-kind={kind} data-low={low || undefined}>
      <span style={{ width: `${part * 100}%` }} />
    </div>
  );
}

// A Armadura só diminui absorvendo golpe: comparar com o valor anterior basta, sem evento novo.
// Subir (Pickup) ou o primeiro valor não piscam
function useArmorHit(armor: number): boolean {
  const previous = useRef(armor);
  const [hit, setHit] = useState(false);

  useEffect(() => {
    const dropped = armor < previous.current;
    previous.current = armor;
    if (!dropped)
      return;
    setHit(true);
    const timer = setTimeout(() => setHit(false), ARMOR_HIT_MS);
    return () => clearTimeout(timer);
  }, [armor]);

  return hit;
}

function Row({ label, icon, className = "", children }: {
  label: string;
  icon: "armor" | "keys";
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <dt className="flex items-center">
        <ResourceIcon kind={icon} />
        <span className="sr-only">{label}</span>
      </dt>
      <dd className="hud-num text-bone">{children}</dd>
    </div>
  );
}

// Rodapé esquerdo da hud.md §2: recursos do Player local, mesmo quando a câmera acompanha outro
export default function Resources({ hud }: { hud: HudState }) {
  const { t } = useTranslation("hud");
  const low = isLowHp(hud);
  const armorHit = useArmorHit(hud.armor);

  return (
    <dl aria-label={t("stats.label")} className="hud-frame flex w-56 max-w-full flex-wrap items-center gap-x-5 gap-y-1">
      <div className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-x-2">
        <dt className="col-span-2 row-start-1 flex items-center gap-2 text-[11px] text-bone/90">
          <ResourceIcon kind="hp" />
          {t("stats.hp")}
        </dt>
        <dd className={`hud-num row-start-1 ${low ? "text-red-300" : "text-red-200"}`}>{t("stats.ofMax", { value: hud.hp, max: hud.maxHp })}</dd>
        <dd aria-hidden="true" className="col-span-3 -mt-2 pl-8"><Bar value={hud.hp} max={hud.maxHp} kind="hp" low={low} /></dd>
        {low && <dd className="col-span-3 pl-8 pt-0.5 text-[10px] font-medium text-red-300">{t("stats.lowHp")}</dd>}
      </div>
      <div className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-x-2">
        <dt className="col-span-2 row-start-1 flex items-center gap-2 text-[11px] text-bone/90">
          <ResourceIcon kind="mana" />
          {t("stats.mana")}
        </dt>
        <dd className="hud-num row-start-1 text-sky-200">{t("stats.ofMax", { value: hud.mana, max: hud.maxMana })}</dd>
        <dd aria-hidden="true" className="col-span-3 -mt-2 pl-8"><Bar value={hud.mana} max={hud.maxMana} kind="mana" /></dd>
      </div>
      {/* a dl só aceita div com um par dt/dd: Armadura e Chaves são filhos diretos, lado a lado pelo flex-wrap */}
      <Row label={t("stats.armor")} icon="armor" className={armorHit ? "hud-hit" : ""}>{hud.armor}</Row>
      <Row label={t("stats.keys")} icon="keys">{hud.keys}</Row>
    </dl>
  );
}
