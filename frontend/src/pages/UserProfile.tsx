import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";
import ErrorNotice, { type Failure } from "../components/ErrorNotice";
import Loading from "../components/Loading";
import { linkClass } from "../components/styles";
import { usePageTitle } from "../hooks/usePageTitle";
import Avatar from "../profile/Avatar";
import FriendButton from "../profile/FriendButton";
import FriendStatus from "../profile/FriendStatus";
import { useProfile } from "../profile/useProfile";
import MatchHistory from "../stats/MatchHistory";
import UserStats from "../stats/UserStats";

// Um id que nem é número dá o mesmo aviso de um User que não existe
const NOT_FOUND: Failure = { code: "user_not_found", requestId: null };

// /users/:userId (i18n.md §3): perfil próprio ou de terceiros, com as estatísticas por Mode e o
// histórico de partidas (F7.8). As conquistas entram aqui também
export default function UserProfile() {
  const { userId } = useParams();
  const id = Number(userId);
  usePageTitle("profile:user.title");

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      {/* id que nem é número não vai ao servidor: o 422 sairia no console do navegador */}
      {Number.isSafeInteger(id) && id > 0
        // key: ir de /users/3 para /users/5 remonta o perfil, sem estado do anterior
        ? <ProfileView key={id} userId={id} />
        : <ErrorNotice failure={NOT_FOUND} />}
    </section>
  );
}

function ProfileView({ userId }: { userId: number }) {
  const { t, i18n } = useTranslation("profile");
  const { profile, setProfile, failure } = useProfile(userId);

  if (failure)
    return <ErrorNotice failure={failure} />;
  if (!profile)
    return <Loading />;

  const since = new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: "long" })
    .format(new Date(profile.created_at));

  return (
    <>
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <Avatar user={profile} large />
        <div className="flex flex-col items-center gap-2 sm:items-start">
          <h1 className="text-2xl font-bold text-torch">{profile.username}</h1>
          <p className="text-sm text-bone/70">{t("user.since", { date: since })}</p>
          {/* presença só de amigo: o servidor não anuncia a dos outros (i18n.md §2.7) */}
          {profile.is_friend && <FriendStatus userId={profile.id} />}
          {profile.is_me
            ? <Link to="/settings" className={linkClass}>{t("user.edit")}</Link>
            : <FriendButton profile={profile}
                onChange={(isFriend) => setProfile({ ...profile, is_friend: isFriend })} />}
        </div>
      </div>
      <UserStats userId={profile.id} />
      <MatchHistory userId={profile.id} />
    </>
  );
}
