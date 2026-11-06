import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";
import { useAuth } from "../auth/AuthContext";
import ErrorNotice, { type Failure } from "../components/ErrorNotice";
import Loading from "../components/Loading";
import { linkClass } from "../components/styles";
import { usePageTitle } from "../hooks/usePageTitle";
import { mapName } from "../lobby/roomOptions";
import { knownReason, matchOutcome } from "../play/outcome";
import { formatClock } from "../play/scoreboardUtils";
import MatchPlayers from "../stats/MatchPlayers";
import { useMatchResult } from "../stats/useMatchResult";

// Um id que nem é número dá o mesmo aviso de um Match que não existe
const NOT_FOUND: Failure = { code: "match_not_found", requestId: null };

// /matches/:matchId (i18n.md §2.6): o Match terminado, lido do banco. Abre no fim do /play e pelo
// histórico, inclusive para quem não jogou
export default function FinishedMatch() {
  const { t } = useTranslation("lobby");
  const { matchId: param = "" } = useParams();
  const matchId = Number(param);
  // o mesmo filtro do /play: id que nem é número não vai ao servidor (o 422 sairia no console)
  const valid = /^[1-9]\d*$/.test(param) && Number.isSafeInteger(matchId);
  usePageTitle("stats:result.title");

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      {/* key: ir de /matches/13 para /matches/14 remonta a tela, sem o resultado da anterior */}
      {valid ? <MatchView key={matchId} matchId={matchId} /> : <ErrorNotice failure={NOT_FOUND} />}
      <Link to="/lobby" className={`self-start ${linkClass}`}>{t("room.back")}</Link>
    </section>
  );
}

function MatchView({ matchId }: { matchId: number }) {
  const { t, i18n } = useTranslation(["stats", "game"]);
  const { user } = useAuth();
  const { detail, failure } = useMatchResult(matchId);

  if (failure)
    return <ErrorNotice failure={failure} />;
  if (!detail)
    return <Loading />;

  const outcome = user ? matchOutcome(detail, user.id) : null;
  const reason = knownReason(detail.reason);
  const endedAt = new Intl.DateTimeFormat(i18n.resolvedLanguage, {
    dateStyle: "long", timeStyle: "short",
  }).format(new Date(detail.ended_at));

  // um item por linha: texto traduzido não se concatena (i18n.md §2.2)
  const rows: Array<[string, string]> = [
    [t("result.details.mode"), t(`game:modes.${detail.mode}`)],
    [t("result.details.map"), mapName(t, detail.map)],
    [t("result.details.duration"), formatClock(detail.duration_s)],
    [t("result.details.endedAt"), endedAt],
  ];

  return (
    <>
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-torch">{t("result.heading", { matchId })}</h1>
        {outcome && <p className="text-xl font-bold">{t(`game:outcomes.${outcome}`)}</p>}
        {reason && <p>{t(`game:reasons.${reason}`)}</p>}
      </header>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-bone/70">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <MatchPlayers detail={detail} userId={user?.id ?? null} />
    </>
  );
}
