import { useTranslation } from "react-i18next";
import type { HudState } from "../../game/src/index";
import Ping from "./Ping";
import Resources from "./Resources";

export default function Hud({ hud }: { hud: HudState }) {
  const { t } = useTranslation("hud");
  // na queda os números ficam, mas são os de antes: o aviso de reconexão já é o status do Match
  const stale = hud.status === "disconnected";

  return (
    <div className="flex flex-col gap-2">
      {stale && <p className="text-bone/70">{t("stale")}</p>}
      <div className={`flex flex-wrap items-end justify-between gap-4 ${stale ? "opacity-60" : ""}`}>
        <Resources hud={hud} />
        <Ping ping={hud.ping} />
      </div>
    </div>
  );
}
