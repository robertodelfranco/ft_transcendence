import { useTranslation } from "react-i18next";
import type { HudState } from "../../game/src/index";
import Help from "./Help";
import KillFeed from "./KillFeed";
import { deathNotice } from "./notices";
import Ping from "./Ping";
import Players from "./Players";
import Resources from "./Resources";
import Scoreboard from "./Scoreboard";

const panel = "rounded bg-crypt-950/75 px-3 py-2";

// Camada sobre o canvas nas regiões da hud.md §2. pointer-events-none: o clique passa para o
// canvas, que pede o Pointer Lock
export default function Hud({ hud, userId }: { hud: HudState; userId: number | null }) {
  const { t } = useTranslation("hud");
  const stale = hud.status === "disconnected";
  const dim = stale ? "opacity-60" : "";
  const death = deathNotice(hud);

  return (
    <div className="pointer-events-none absolute inset-0 grid grid-cols-2 grid-rows-[auto_1fr_auto] gap-2 p-3 text-sm">
      {/* topo esquerdo: Players no coop; placar e relógio no pvp */}
      {hud.mode !== null && (
        <div className={`col-start-1 row-start-1 justify-self-start ${panel} ${dim}`}>
          {hud.mode === "coop"
            ? <Players players={hud.players} userId={userId} />
            : <Scoreboard hud={hud} userId={userId} />}
        </div>
      )}
      {/* topo direito: ping e ajuda; no pvp, também o kill feed */}
      <div className={`col-start-2 row-start-1 flex flex-col items-end gap-2 justify-self-end ${panel} ${dim}`}>
        <Ping ping={hud.ping} />
        <Help mode={hud.mode} />
        {hud.mode === "pvp" && <KillFeed killfeed={hud.killfeed} players={hud.players} />}
      </div>
      {/* centro: livre na partida normal. A região de status fica sempre montada, para o leitor
          de tela anunciar o texto que entra nela */}
      <div role="status" className="col-span-2 row-start-2 self-center justify-self-center text-center">
        {stale && (
          <div className={panel}>
            <p>{t("reconnecting")}</p>
            <p className="text-bone/70">{t("stale")}</p>
          </div>
        )}
        {death && <p className={panel}>{t(`death.${death}`)}</p>}
      </div>
      <div className={`col-start-1 row-start-3 self-end justify-self-start ${panel} ${dim}`}>
        <Resources hud={hud} />
      </div>
      {/* rodapé direito: reservado ao minimapa (F3.6), que o jogo desenha no canvas */}
    </div>
  );
}
