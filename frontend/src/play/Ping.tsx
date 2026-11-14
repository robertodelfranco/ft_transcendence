import { useTranslation } from "react-i18next";

// RTT em ms; null (antes da F2.12) é "indisponível", nunca 0 ms
export default function Ping({ ping }: { ping: number | null }) {
  const { t } = useTranslation("hud");

  return (
    <dl className="hud-frame flex items-baseline gap-2 py-1 text-[11px]">
      <dt className="text-bone/70">{t("ping.label")}</dt>
      <dd className="hud-num text-bone/90">
        {ping === null ? (
          <>
            <span aria-hidden>{t("ping.none")}</span>
            <span className="sr-only">{t("ping.unavailable")}</span>
          </>
        ): t("ping.ms", { ms: Math.round(ping) })}
      </dd>
    </dl>
  );
}
