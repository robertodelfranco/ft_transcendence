import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";
import { apiFetch } from "../api/client";
import type { Mode, RoomInfo } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import ErrorNotice, { toFailure, type Failure } from "../components/ErrorNotice";
import { buttonPrimary, buttonSecondary, fieldClass, linkClass } from "../components/styles";
import { MODES, mapName } from "./roomOptions";
import type { useLobbyRooms } from "./useLobbyRooms";

type Filter = Mode | "all";

// A lista de Rooms abertas com o filtro por Mode. O filtro é no cliente: a lista é pequena e
// as mensagens ao vivo valem para todas as Rooms, não só para as do Mode escolhido
export default function RoomList({ lobby }: { lobby: ReturnType<typeof useLobbyRooms> }) {
  const { t } = useTranslation("lobby");
  const { user } = useAuth();
  const navigate = useNavigate();
  const id = useId();
  const [filter, setFilter] = useState<Filter>("all");
  const [joining, setJoining] = useState<number | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);

  const { rooms, failure: loadFailure, apply, reload } = lobby;
  const mine = rooms?.find((room) => room.players.some((player) => player.user_id === user?.id));
  const visible = (rooms ?? []).filter((room) => filter === "all" || room.mode === filter);

  async function join(room: RoomInfo) {
    setFailure(null);
    setJoining(room.match_id);
    try {
      apply(await apiFetch<RoomInfo>(`/api/matches/${room.match_id}/join`, { method: "POST" }));
      navigate(`/lobby/${room.match_id}`);
    } catch (error) {
      setJoining(null);
      setFailure(toFailure(error));
    }
  }

  return (
    <section aria-labelledby={`${id}-heading`} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 id={`${id}-heading`} className="text-xl font-bold">{t("rooms.heading")}</h2>
        <label className="flex items-center gap-2 text-sm">
          {t("rooms.filter")}
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as Filter)}
            className={fieldClass}
          >
            <option value="all">{t("rooms.all")}</option>
            {MODES.map((mode) => (
              <option key={mode} value={mode}>{t(`game:modes.${mode}`)}</option>
            ))}
          </select>
        </label>
      </div>

      {mine && (
        <p className="text-sm">
          {t("rooms.mine")}{" "}
          <Link to={`/lobby/${mine.match_id}`} className={linkClass}>{t("rooms.toMine")}</Link>
        </p>
      )}

      {failure && <ErrorNotice failure={failure} />}

      {loadFailure && (
        <div className="flex flex-col items-start gap-2">
          <ErrorNotice failure={loadFailure} />
          <button type="button" onClick={reload} className={buttonSecondary}>{t("rooms.retry")}</button>
        </div>
      )}

      {!rooms && !loadFailure && <p role="status">{t("rooms.loading")}</p>}

      {rooms && visible.length === 0 && <p className="text-bone/70">{t("rooms.empty")}</p>}

      <ul className="flex flex-col gap-3">
        {visible.map((room) => {
          const host = room.players.find((player) => player.user_id === room.created_by);
          const full = room.players.length >= room.max_players;
          const isMine = room.match_id === mine?.match_id;
          return (
            <li
              key={room.match_id}
              className="flex flex-wrap items-center justify-between gap-3 rounded border border-crypt-700 bg-crypt-900 p-3"
            >
              <div className="flex flex-col gap-1">
                <p className="flex items-baseline gap-2">
                  <span className="font-bold">{mapName(t, room.map)}</span>
                  <span className="text-sm text-torch">{t(`game:modes.${room.mode}`)}</span>
                </p>
                <p className="text-sm text-bone/70">
                  {t(`game:themes.${room.options.theme}`)}
                  {" · "}
                  {t("rooms.players", { count: room.players.length, max: room.max_players })}
                  {host && (
                    <>
                      {" · "}
                      {t("rooms.host", { username: host.username })}
                    </>
                  )}
                </p>
              </div>
              {isMine ? (
                <Link to={`/lobby/${room.match_id}`} className={buttonSecondary}>{t("rooms.open")}</Link>
              ) : (
                <button
                  type="button"
                  onClick={() => join(room)}
                  disabled={full || mine !== undefined || joining !== null}
                  className={buttonPrimary}
                >
                  {t("rooms.join")}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
