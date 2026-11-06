import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import type { MatchHistoryItem, Page } from "../api/types";
import ErrorNotice from "../components/ErrorNotice";
import Loading from "../components/Loading";
import { buttonSecondary, linkClass } from "../components/styles";
import { useApi } from "../hooks/useApi";
import { mapName } from "../lobby/roomOptions";
import { formatClock } from "../play/scoreboardUtils";

const PER_PAGE = 10;

// GET /api/users/{id}/matches (matches-api.md §2.3): só Matches finished, do mais recente para o
// mais antigo, com o resultado do ponto de vista deste User
export default function MatchHistory({ userId }: { userId: number }) {
  const { t } = useTranslation("stats");
  const titleId = useId();
  const [page, setPage] = useState(1);
  const query = new URLSearchParams({ page: String(page), per_page: String(PER_PAGE) });
  const { data, failure } = useApi<Page<MatchHistoryItem>>(`/api/users/${userId}/matches?${query}`);

  let body;
  if (failure)
    body = <ErrorNotice failure={failure} />;
  else if (!data)
    body = <Loading />;
  else if (data.items.length === 0)
    body = <p className="text-bone/70">{t("history.empty")}</p>;
  else
    body = (
      <ol className="flex flex-col gap-2">
        {data.items.map((item) => <HistoryRow key={item.match_id} item={item} />)}
      </ol>
    );

  // o total e o per_page vêm da resposta: o servidor pode ter aplicado o teto de 50
  const pages = data ? Math.max(1, Math.ceil(data.total / data.per_page)) : 1;

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3">
      <h2 id={titleId} className="text-lg font-bold">{t("history.title")}</h2>
      {body}
      {data && pages > 1 && (
        <nav aria-label={t("history.pages")} className="flex items-center gap-3">
          <button type="button" className={buttonSecondary} disabled={page <= 1}
            onClick={() => setPage(page - 1)}>
            {t("history.previous")}
          </button>
          <span className="text-sm">{t("history.page", { page: data.page, pages })}</span>
          <button type="button" className={buttonSecondary} disabled={page >= pages}
            onClick={() => setPage(page + 1)}>
            {t("history.next")}
          </button>
        </nav>
      )}
    </section>
  );
}

function HistoryRow({ item }: { item: MatchHistoryItem }) {
  const { t, i18n } = useTranslation(["stats", "game"]);
  const date = new Intl.DateTimeFormat(i18n.resolvedLanguage, {
    dateStyle: "medium", timeStyle: "short",
  }).format(new Date(item.ended_at));
  const names = new Intl.ListFormat(i18n.resolvedLanguage, { type: "conjunction" })
    .format(item.others.map((other) => other.username));

  // no pvp, o outro é o oponente; no coop, são companheiros, e a partida pode ter sido solo
  let others;
  if (item.others.length === 0)
    others = t("history.alone");
  else
    others = t(item.mode === "pvp" ? "history.against" : "history.with", { names });

  return (
    <li className="flex flex-col gap-1 rounded border border-crypt-700 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-1">
        <p className="flex flex-wrap gap-x-3">
          <span className={`font-bold ${item.result === "win" ? "text-torch" : ""}`}>
            {t(`history.results.${item.result}`)}
          </span>
          <span>{t(`game:modes.${item.mode}`)}</span>
          <span>{mapName(t, item.map)}</span>
        </p>
        <p className="flex flex-wrap gap-x-3 text-sm text-bone/70">
          <time dateTime={item.ended_at}>{date}</time>
          <span>{formatClock(item.duration_s)}</span>
        </p>
        <p className="text-sm">{others}</p>
      </div>
      <Link to={`/matches/${item.match_id}`} className={`self-start sm:self-center ${linkClass}`}>
        {t("history.details", { matchId: item.match_id })}
      </Link>
    </li>
  );
}
