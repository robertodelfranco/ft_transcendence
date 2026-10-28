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

// Duas formas, a mesma ordem (hud.md §2). Em janela estreita os grupos ficam abaixo do canvas, um
// sob o outro, na ordem de prioridade: aviso, recursos, Players ou placar, e por fim ping, ajuda e
// feed. A partir do md viram uma camada sobre o canvas, cada grupo no seu canto, e o
// pointer-events-none deixa o clique passar para o canvas, que pede o Pointer Lock
export default function Hud({ hud, userId }: { hud: HudState; userId: number | null }) {
  const { t } = useTranslation("hud");
  const stale = hud.status === "disconnected";
  const dim = stale ? "opacity-60" : "";
  const death = deathNotice(hud);

  return (
    <div className="mt-2 flex flex-col gap-2 text-sm md:pointer-events-none md:absolute md:inset-0 md:mt-0 md:grid md:grid-cols-2 md:grid-rows-[auto_1fr_auto] md:p-3">
      {/* centro: livre na partida normal. A região de status fica sempre montada, para o leitor
          de tela anunciar o texto que entra nela */}
      <div role="status" className="self-center text-center md:col-span-2 md:row-start-2 md:justify-self-center">
        {stale && (
          <div className={panel}>
            <p>{t("reconnecting")}</p>
            <p className="text-bone/70">{t("stale")}</p>
          </div>
        )}
        {death && <p className={panel}>{t(`death.${death}`)}</p>}
      </div>
      {/* rodapé esquerdo; o direito fica para o minimapa (F3.6), que o jogo desenha no canvas */}
      <div className={`self-start md:col-start-1 md:row-start-3 md:self-end md:justify-self-start ${panel} ${dim}`}>
        <Resources hud={hud} />
      </div>
      {/* topo esquerdo: Players no coop; placar e relógio no pvp */}
      {hud.mode !== null && (
        <div className={`self-start md:col-start-1 md:row-start-1 md:justify-self-start ${panel} ${dim}`}>
          {hud.mode === "coop"
            ? <Players players={hud.players} userId={userId} />
            : <Scoreboard hud={hud} userId={userId} />}
        </div>
      )}
      {/* topo direito: ping e ajuda; no pvp, também o kill feed */}
      <div className={`flex flex-col items-start gap-2 self-start md:col-start-2 md:row-start-1 md:items-end md:justify-self-end ${panel} ${dim}`}>
        <Ping ping={hud.ping} />
        <Help mode={hud.mode} />
        {hud.mode === "pvp" && <KillFeed killfeed={hud.killfeed} players={hud.players} />}
      </div>
    </div>
  );
}