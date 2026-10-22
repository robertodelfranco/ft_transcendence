import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";
import ErrorNotice, { type Failure } from "../components/ErrorNotice";
import { linkClass } from "../components/styles";
import { usePageTitle } from "../hooks/usePageTitle";
import Match from "../play/Match";

const NOT_FOUND: Failure = { code: "room_not_found", requestId: null };

// /play/:matchId: valida o id e monta a partida (F7.6). O canvas e a HUD ficam no Match
export default function Play() {
  const { t } = useTranslation(["hud", "lobby"]);
  const { matchId: param = "" } = useParams();
  const [attempt, setAttempt] = useState(0);
  const valid = /^[1-9]\d*$/.test(param);
  const matchId = Number(param);
  usePageTitle("hud:title");

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold text-torch">{t("title")}</h1>
      {valid ? (
        <Match
          key={`${matchId}:${attempt}`}
          matchId={matchId}
          onRetry={() => setAttempt((count) => count + 1)}
        />
      ) : (
        <>
          <ErrorNotice failure={NOT_FOUND} />
          <Link to="/lobby" className={`self-start ${linkClass}`}>{t("lobby:room.back")}</Link>
        </>
      )}
    </section>
  );
}
