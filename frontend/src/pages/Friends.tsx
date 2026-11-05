import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import ErrorNotice from "../components/ErrorNotice";
import Loading from "../components/Loading";
import { usePageTitle } from "../hooks/usePageTitle";
import FriendRow from "../profile/FriendRow";
import { useFriends } from "../profile/useFriends";
import UserSearch from "../profile/UserSearch";

// /friends (i18n.md §3): amigos com presença ao vivo e busca para adicionar
export default function Friends() {
  const { t } = useTranslation("profile");
  const { friends, failure, added, removed } = useFriends();
  const friendIds = useMemo(() => new Set(friends?.map((friend) => friend.id)), [friends]);
  usePageTitle("profile:friends.title");

  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      <h1 className="text-2xl font-bold text-torch">{t("friends.title")}</h1>
      {failure && <ErrorNotice failure={failure} />}
      {!failure && friends === null && <Loading />}
      {friends?.length === 0 && <p>{t("friends.empty")}</p>}
      {/* a contagem só com alguém na lista: no plural do pt-BR, 0 conta como singular ("0 amigo") */}
      {friends && friends.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-bone/70">{t("friends.count", { count: friends.length })}</p>
          <ul className="flex flex-col gap-2">
            {friends.map((friend) => <FriendRow key={friend.id} friend={friend} onRemoved={removed} />)}
          </ul>
        </div>
      )}
      <section aria-labelledby="add-friends" className="flex flex-col gap-3">
        <h2 id="add-friends" className="text-lg font-bold">{t("friends.search.heading")}</h2>
        <UserSearch friendIds={friendIds} onAdded={added} />
      </section>
    </section>
  );
}
