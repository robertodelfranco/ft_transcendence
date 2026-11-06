import { useId } from "react";
import { useTranslation } from "react-i18next";
import type { AchievementsResponse } from "../api/types";
import ErrorNotice from "../components/ErrorNotice";
import Loading from "../components/Loading";
import { useApi } from "../hooks/useApi";
import AchievementCard from "./AchievementCard";

// GET /api/users/{id}/achievements (matches-api.md §2.3): o catálogo inteiro, com as desbloqueadas
// marcadas. A ordem é a do catálogo (progression.md §3), não a do desbloqueio
export default function UserAchievements({ userId }: { userId: number }) {
  const { t } = useTranslation("stats");
  const titleId = useId();
  const { data, failure } = useApi<AchievementsResponse>(`/api/users/${userId}/achievements`);

  let body;
  if (failure)
    body = <ErrorNotice failure={failure} />;
  else if (!data)
    body = <Loading />;
  else
    body = <AchievementGrid data={data} />;

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3">
      <h2 id={titleId} className="text-lg font-bold">{t("achievements.title")}</h2>
      {body}
    </section>
  );
}

function AchievementGrid({ data }: { data: AchievementsResponse }) {
  const { t, i18n } = useTranslation("stats");
  const date = new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: "long" });
  const unlockedAt = new Map(data.unlocked.map((item) => [item.code, item.unlocked_at]));
  // conta pelo catálogo: um desbloqueio de code que o catálogo não tem não vira "8 de 7"
  const count = data.catalog.filter(({ code }) => unlockedAt.has(code)).length;

  return (
    <>
      <p className="text-sm text-bone/70">
        {t("achievements.summary", { unlocked: count, total: data.catalog.length })}
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {data.catalog.map(({ code }) => {
          const at = unlockedAt.get(code);
          return (
            <AchievementCard
              key={code}
              code={code}
              locked={at === undefined}
              note={at === undefined
                ? t("achievements.locked")
                : t("achievements.unlockedAt", { date: date.format(new Date(at)) })}
            />
          );
        })}
      </ul>
    </>
  );
}
