import { useTranslation } from "react-i18next";
import { useFriendsPresence } from "../ws/FriendsPresence";

// Status de um amigo, ao vivo pelo /ws/app. Texto além da cor; enquanto o socket reconecta, o
// status é desconhecido, nunca offline (i18n.md §2.7)
export default function FriendStatus({ userId }: { userId: number }) {
  const { t } = useTranslation("profile");
  const online = useFriendsPresence().isOnline(userId);
  const state = online === null ? "unknown" : online ? "online" : "offline";

  return (
    <span className="flex items-center gap-2 text-sm">
      <span aria-hidden className={`size-2 rounded-full ${online ? "bg-green-500" : "bg-crypt-700"}`} />
      {t(`friends.${state}`)}
    </span>
  );
}
