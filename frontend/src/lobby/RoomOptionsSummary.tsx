import { useTranslation } from "react-i18next";
import type { Pickups, RoomOptions } from "../api/types";

const PICKUPS: readonly (keyof Pickups)[] = ["potion", "mana", "armor"];

// Lista só de leitura das opções: os defaults no formulário, ou as opções de uma Room criada.
// O pvp mostra frag_limit e time_limit_s; o coop chega sem eles
export default function RoomOptionsSummary({ options }: { options: RoomOptions }) {
  const { t } = useTranslation("lobby");

  // um item por linha: texto traduzido não se concatena (i18n.md §2.2)
  const rows: Array<[string, string]> = [
    [t("options.theme"), t(`game:themes.${options.theme}`)],
    [t("options.startHp"), String(options.start_hp)],
    ...PICKUPS.map((item): [string, string] =>
      [t(`options.${item}`), t(options.pickups[item] ? "options.on" : "options.off")]),
  ];
  if (options.frag_limit !== undefined)
    rows.push([t("options.fragLimit"), String(options.frag_limit)]);
  if (options.time_limit_s !== undefined)
    rows.push([t("options.timeLimit"), t("options.seconds", { count: options.time_limit_s })]);

  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-bone/70">{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
