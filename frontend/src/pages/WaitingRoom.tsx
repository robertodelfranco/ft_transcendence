import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";
import { ApiError, apiFetch } from "../api/client";
import type { RoomInfo } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import ErrorNotice, { toFailure, type Failure } from "../components/ErrorNotice";
import Loading from "../components/Loading";
import { buttonPrimary, buttonSecondary, linkClass } from "../components/styles";
import { usePageTitle } from "../hooks/usePageTitle";
import { mapName } from "../lobby/roomOptions";
import RoomOptionsSummary from "../lobby/RoomOptionsSummary";
import { useLobbyRooms } from "../lobby/useLobbyRooms";
import { useAppMessages } from "../ws/AppSocketContext";
import SocketNotice from "../ws/SocketNotice";

// Por que a Room não está mais na lista de abertas
type Gone = "started" | "aborted" | "missing";

// Sala de espera em /lobby/:matchId. A Room dela está em lobby, então vem da mesma lista viva do
// lobby (useLobbyRooms): o buffer e o GET depois de cada welcome valem aqui também
export default function WaitingRoom() {
  const { t } = useTranslation("lobby");
  const { matchId: param } = useParams();
  const matchId = Number(param);
  const { user } = useAuth();
  const navigate = useNavigate();
  const { rooms, failure: loadFailure, runAction } = useLobbyRooms();
  const [gone, setGone] = useState<Gone | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  usePageTitle("lobby:room.title");

  const room = rooms?.find((candidate) => candidate.match_id === matchId);
  const me = room?.players.find((player) => player.user_id === user?.id);

  // O match_started (ir para /play) é do MatchStartedRedirect, na casca inteira. Ele chega antes do
  // lobby_removed "started", e quem joga ignora esse aviso: senão a tela piscaria "já começou"
  // antes de trocar. Com aborted (o último saiu), a sala fecha para quem estava nela ou olhando
  useAppMessages((message) => {
    if (message.type === "lobby_removed" && message.match_id === matchId
      && !(message.reason === "started" && me))
      setGone(message.reason);
  });

  // A lista carregou e a Room não está nela: já começou, ou não existe. Recarregar a página
  // depois do start cai aqui, e quem joga segue para a partida
  const missing = rooms !== null && room === undefined && gone === null;
  useEffect(() => {
    if (!missing)
      return;
    let cancelled = false;
    apiFetch<RoomInfo>(`/api/matches/${matchId}`)
      .then((info) => {
        if (cancelled)
          return;
        const playing = info.players.some((player) => player.user_id === user?.id);
        if (info.status === "running" && playing)
          navigate(`/play/${matchId}`, { replace: true });
        else
          setGone(info.status === "running" ? "started" : "missing");
      })
      .catch((error: unknown) => {
        if (cancelled)
          return;
        if (error instanceof ApiError && error.status === 404)
          setGone("missing");
        else
          setFailure(toFailure(error));
      });
    return () => {
      cancelled = true;
    };
  }, [missing, matchId, navigate, user?.id]);

  // join e ready passam pelo runAction (a resposta não sobrescreve o socket); leave e start
  // devolvem 204
  async function act(action: () => Promise<void>) {
    setFailure(null);
    setBusy(true);
    try {
      await action();
    } catch (error) {
      setFailure(toFailure(error));
    } finally {
      setBusy(false);
    }
  }

  const post = (path: string, body?: object) =>
    apiFetch<RoomInfo>(`/api/matches/${matchId}/${path}`, {
      method: "POST",
      body: body && JSON.stringify(body),
    });

  if (gone) {
    return (
      <section className="flex flex-col items-start gap-4">
        <h1 className="text-2xl font-bold text-torch">{t("room.title")}</h1>
        <p role="status">{t(`room.${gone}`)}</p>
        <Link to="/lobby" className={linkClass}>{t("room.back")}</Link>
      </section>
    );
  }

  if (loadFailure && !room)
    return <ErrorNotice failure={loadFailure} />;
  if (!room)
    return failure ? <ErrorNotice failure={failure} /> : <Loading />;

  const isHost = room.created_by === user?.id;
  const enough = room.players.length >= room.min_players;

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-torch">{t("room.title")}</h1>
        <p className="text-lg">
          {mapName(t, room.map)}
          <span className="ml-2 text-sm text-torch">{t(`game:modes.${room.mode}`)}</span>
        </p>
      </div>

      <SocketNotice />
      {failure && <ErrorNotice failure={failure} />}

      <div className="grid gap-8 md:grid-cols-[2fr_1fr]">
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-bold">
            {t("room.players", { count: room.players.length, max: room.max_players })}
          </h2>
          {/* a ordem é a de entrada, que também é a ordem de sucessão do host */}
          <ul className="flex flex-col gap-2">
            {room.players.map((player) => (
              <li
                key={player.user_id}
                className="flex flex-wrap items-center gap-2 rounded border border-crypt-700 bg-crypt-900 px-3 py-2"
              >
                <span className="font-bold">{player.username}</span>
                {player.user_id === user?.id && <span className="text-sm text-bone/70">({t("room.you")})</span>}
                {player.user_id === room.created_by && (
                  <span className="rounded bg-torch/20 px-2 text-xs text-torch">{t("room.host")}</span>
                )}
                <span className={`ml-auto text-sm ${player.ready ? "text-emerald-400" : "text-bone/70"}`}>
                  {player.connected
                    ? t(player.ready ? "room.ready" : "room.notReady")
                    : t("room.disconnected")}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="flex flex-col gap-3">
          <RoomOptionsSummary options={room.options} />
        </section>
      </div>

      {me ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => act(async () => {
              await runAction(matchId, () => post("ready", { ready: !me.ready }));
            })}
            className={buttonSecondary}
          >
            {me.ready ? t("room.unsetReady") : t("room.setReady")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => act(async () => {
              await post("leave");
              navigate("/lobby");
            })}
            className={buttonSecondary}
          >
            {t("room.leave")}
          </button>
          {isHost && (
            <button
              type="button"
              disabled={busy || !enough}
              onClick={() => act(async () => {
                await post("start");
                // o match_started também leva para /play; isto cobre o /ws/app reconectando agora
                navigate(`/play/${matchId}`, { replace: true });
              })}
              className={buttonPrimary}
            >
              {t("room.start")}
            </button>
          )}
          {/* o start do servidor confere só min_players, sem olhar o pronto (rooms.md "Em aberto" 3) */}
          {isHost && !enough && (
            <p className="text-sm text-bone/70">{t("room.needPlayers", { count: room.min_players })}</p>
          )}
          {!isHost && <p className="text-sm text-bone/70">{t("room.waitingHost")}</p>}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <p>{t("room.notMember")}</p>
          <button
            type="button"
            disabled={busy || room.players.length >= room.max_players}
            onClick={() => act(async () => {
              await runAction(matchId, () => post("join"));
            })}
            className={buttonPrimary}
          >
            {t("room.join")}
          </button>
          <Link to="/lobby" className={linkClass}>{t("room.back")}</Link>
        </div>
      )}
    </section>
  );
}
