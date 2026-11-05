import { useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../api/client";
import type { Friend, ProfileUser } from "../api/types";
import ErrorNotice, { toFailure, type Failure } from "../components/ErrorNotice";
import { buttonPrimary, buttonSecondary } from "../components/styles";
import { useFriendsPresence } from "../ws/FriendsPresence";

// Adicionar ou remover dos amigos (i18n.md §2.7). As duas rotas são idempotentes: o mesmo clique
// em duas abas não vira erro
export default function FriendButton({ profile, onChange }: {
  profile: ProfileUser;
  onChange: (isFriend: boolean) => void;
}) {
  const { t } = useTranslation("profile");
  const { setOnline } = useFriendsPresence();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const path = `/api/users/me/friends/${profile.id}`;

  async function toggle() {
    setBusy(true);
    setFailure(null);
    try {
      if (profile.is_friend) {
        await apiFetch<void>(path, { method: "DELETE" });
        onChange(false);
      } else {
        // virou amigo depois do welcome: o online vem da resposta, e o presence dele chega depois
        const friend = await apiFetch<Friend>(path, { method: "PUT" });
        setOnline(friend.id, friend.online);
        onChange(true);
      }
    } catch (error) {
      setFailure(toFailure(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-2 sm:items-start">
      <button type="button" onClick={toggle} disabled={busy}
        className={profile.is_friend ? buttonSecondary : buttonPrimary}>
        {t(profile.is_friend ? "user.removeFriend" : "user.addFriend")}
      </button>
      {failure && <ErrorNotice failure={failure} />}
    </div>
  );
}
