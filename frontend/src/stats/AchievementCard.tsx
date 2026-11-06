import { useTranslation } from "react-i18next";

// Uma conquista: título e descrição saem do code (i18n.md §2.2). Code sem tradução mostra o próprio
// code e fica sem descrição, nunca a chave crua
export default function AchievementCard({ code, note, locked = false }: {
  code: string;
  note?: string; // o estado: "Desbloqueada em ..." ou "Bloqueada"
  locked?: boolean; // ainda não desbloqueada: texto apagado, e o note diz o estado em palavras
}) {
  const { t, i18n } = useTranslation("game");
  const description = `achievements.${code}.description`;

  return (
    <li className={`flex flex-col gap-1 rounded border border-crypt-700 p-3 ${locked ? "text-bone/70" : ""}`}>
      <p className={`font-bold ${locked ? "" : "text-torch"}`}>
        {t(`achievements.${code}.title`, { defaultValue: code })}
      </p>
      {i18n.exists(`game:${description}`) && <p className="text-sm">{t(description)}</p>}
      {note && <p className="text-sm text-bone/70">{note}</p>}
    </li>
  );
}
