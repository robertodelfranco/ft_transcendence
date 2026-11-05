import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { apiFetch } from "../api/client";
import type { Friend } from "../api/types";
import ErrorNotice, { toFailure, type Failure } from "../components/ErrorNotice";
import { buttonSecondary, linkClass } from "../components/styles";
import Avatar from "./Avatar";
import FriendStatus from "./FriendStatus";

// Um amigo na lista de /friends: avatar, nome que leva ao perfil, presença ao vivo e remover
export default function FriendRow({ friend, onRemoved }: {
  friend: Friend;
  onRemoved: (userId: number) => void;
}) {
  const { t } = useTranslation("profile");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);

  async function remove() {
    setBusy(true);
    setFailure(null);
    try {
      await apiFetch<void>(`/api/users/me/friends/${friend.id}`, { method: "DELETE" });
      onRemoved(friend.id);
    } catch (error) {
      setFailure(toFailure(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-col gap-2 rounded border border-crypt-700 p-3">
      <div className="flex items-center gap-3">
        <Avatar user={friend} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Link to={`/users/${friend.id}`} className={`${linkClass} truncate`}>{friend.username}</Link>
          <FriendStatus userId={friend.id} />
        </div>
        {/* um "Remover" por linha: o nome acessível diz de quem, e começa pelo texto visível */}
        <button type="button" onClick={remove} disabled={busy} className={buttonSecondary}
          aria-label={t("friends.remove", { username: friend.username })}>
          {t("friends.removeShort")}
        </button>
      </div>
      {failure && <ErrorNotice failure={failure} />}
    </li>
  );
}
