import { useId } from "react";
import { useTranslation } from "react-i18next";
import type { AchievementsResponse } from "../api/types";
import ErrorNotice from "../components/ErrorNotice";
import { useApi } from "../hooks/useApi";
import AchievementCard from "./AchievementCard";

// As conquistas que saíram nesta partida: as do User com match_id igual ao do Match (slice, decisão
// 7). O record_match_result grava o desbloqueio na mesma transação que fecha o Match (rooms.md §2.5),
// então com o /result já respondido elas estão no banco: não precisa de nova tentativa
export default function MatchAchievements({ userId, matchId }: { userId: number; matchId: number }) {
  const { t } = useTranslation("stats");
  const titleId = useId();
  const { data, failure } = useApi<AchievementsResponse>(`/api/users/${userId}/achievements`);

  if (failure)
    return <ErrorNotice failure={failure} />;
  // carregando, ou sem nada novo nesta partida: a seção nem aparece
  const earned = data?.unlocked.filter((item) => item.match_id === matchId) ?? [];
  if (earned.length === 0)
    return null;

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3">
      <h2 id={titleId} className="text-lg font-bold">{t("achievements.earned")}</h2>
      <ul className="grid gap-2 sm:grid-cols-2">
        {earned.map(({ code }) => <AchievementCard key={code} code={code} />)}
      </ul>
    </section>
  );
}
