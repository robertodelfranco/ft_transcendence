import { useTranslation } from "react-i18next";
import type { HudState } from "../../game/src/index";
import Help from "./Help";
import KillFeed from "./KillFeed";
import { deathNotice } from "./notices";
import Ping from "./Ping";
import Players from "./Players";
import Resources from "./Resources";
import Scoreboard from "./Scoreboard";

// Duas formas, a mesma ordem (hud.md §2). Em janela estreita os grupos ficam abaixo do canvas, um
// sob o outro e centralizados, na ordem de prioridade: aviso, recursos, Players ou placar, e por fim
// ping, ajuda e feed. A partir do md viram uma camada sobre o canvas, cada grupo no seu canto, e o
// pointer-events-none deixa o clique passar para o canvas, que pede o Pointer Lock
export default function Hud({ hud, userId }: { hud: HudState; userId: number | null }) {
  const { t } = useTranslation("hud");
  const stale = hud.status === "disconnected";
  const dim = stale ? "opacity-60" : "";
  const death = deathNotice(hud);

  return (
    <div className="mt-2 flex flex-col gap-2 text-xs leading-relaxed [text-shadow:0_1px_3px_rgba(0,0,0,0.95),0_0_8px_rgba(0,0,0,0.65)] md:pointer-events-none md:absolute md:inset-0 md:mt-0 md:grid md:grid-cols-2 md:grid-rows-[auto_1fr_auto] md:p-3">
      {/* centro: livre na partida normal. A região de status fica sempre montada, para o leitor
          de tela anunciar o texto que entra nela */}
      <div role="status" className="self-center text-center md:col-span-2 md:row-start-2 md:justify-self-center">
        {stale && (
          <div className="px-2 py-1">
            <p>{t("reconnecting")}</p>
            <p className="text-bone/70">{t("stale")}</p>
          </div>
        )}
        {death && <p className="px-2 py-1">{t(`death.${death}`)}</p>}
      </div>
      {/* rodapé esquerdo; o direito fica para o minimapa (F3.6), que o jogo desenha no canvas */}
      <div className={`max-w-full self-center md:col-start-1 md:row-start-3 md:self-end md:justify-self-start ${dim}`}>
        <Resources hud={hud} />
      </div>
      {/* topo esquerdo: Players no coop; placar e relógio no pvp */}
      {hud.mode !== null && (
        <div className={`w-48 max-w-full self-center sm:w-52 md:col-start-1 md:row-start-1 md:self-start md:justify-self-start ${dim}`}>
          {hud.mode === "coop"
            ? <Players players={hud.players} userId={userId} />
            : <Scoreboard hud={hud} userId={userId} />}
        </div>
      )}
      {/* topo direito: ping e ajuda; no pvp, também o kill feed */}
      <div className={`flex max-w-full flex-col items-center gap-1 self-center md:col-start-2 md:row-start-1 md:items-end md:self-start md:justify-self-end ${dim}`}>
        <Ping ping={hud.ping} />
        <Help mode={hud.mode} />
        {hud.mode === "pvp" && <KillFeed killfeed={hud.killfeed} players={hud.players} />}
      </div>
    </div>
  );
}
