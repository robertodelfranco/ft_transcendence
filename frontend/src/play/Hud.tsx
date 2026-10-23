import { useTranslation } from "react-i18next";
import type { HudState } from "../../game/src/index";

export default function Hud({ hud }: { hud: HudState }) {
  const { t } = useTranslation("hud");
  const stats = [
    { key: "hp", value: t("stats.ofMax", { value: hud.hp, max: hud.maxHp }) },
    { key: "mana", value: t("stats.ofMax", { value: hud.mana, max: hud.maxMana }) },
    { key: "armor", value: hud.armor },
    { key: "keys", value: hud.keys },
  ] as const;

  return (
    <dl aria-label={t("stats.label")} className="flex flex-wrap gap-x-6 gap-y-1">
      {stats.map((stat) => (
        <div key={stat.key} className="flex gap-2">
          <dt className="text-bone/70">{t(`stats.${stat.key}`)}</dt>
          <dd className="font-bold">{stat.value}</dd>
        </div>
      ))}
    </dl>
  );
}