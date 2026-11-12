import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { apiFetch } from "../api/client";
import type { Friend, PublicUser } from "../api/types";
import { normalize } from "../auth/validation";
import ErrorNotice, { toFailure, type Failure } from "../components/ErrorNotice";
import Loading from "../components/Loading";
import { buttonPrimary, fieldClass, linkClass } from "../components/styles";
import Avatar from "./Avatar";

// O que o backend aceita em ?search= (i18n.md §2.7): fora disso nem sai, e o 422 não aparece
const SEARCH = /^[a-z0-9_]{2,20}$/;
// a busca sai quando a pessoa para de digitar: o limite é de 60 por minuto por User
const DEBOUNCE_MS = 300;

// Busca de Users por prefixo do username, para adicionar aos amigos. O próprio User não vem
export default function UserSearch({ friendIds, onAdded }: {
  friendIds: ReadonlySet<number>;
  onAdded: (friend: Friend) => void;
}) {
  const { t } = useTranslation("profile");
  const id = useId();
  const [query, setQuery] = useState("");
  // o resultado guarda o prefixo que o trouxe: outra busca em curso não mostra a lista anterior
  const [found, setFound] = useState<{ prefix: string; users: PublicUser[] } | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const prefix = normalize(query);
  const valid = SEARCH.test(prefix);
  const users = found?.prefix === prefix ? found.users : null;

  useEffect(() => {
    if (!valid)
      return;
    // cada tecla cancela a espera da anterior, e a resposta de uma busca velha é descartada
    const controller = new AbortController();
    const timer = setTimeout(() => {
      apiFetch<{ items: PublicUser[] }>(`/api/users?${new URLSearchParams({ search: prefix })}`,
        { signal: controller.signal })
        .then(({ items }) => {
          if (controller.signal.aborted)
            return;
          setFound({ prefix, users: items });
          setFailure(null);
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted)
            setFailure(toFailure(error));
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [prefix, valid]);

  return (
    <div className="flex flex-col gap-3">
      <label htmlFor={id} className="text-sm">{t("friends.search.label")}</label>
      <input id={id} type="search" value={query} onChange={(e) => setQuery(e.target.value)}
        autoComplete="off" aria-describedby={`${id}-hint`} className={fieldClass} />
      <p id={`${id}-hint`} className="text-sm text-bone/70">{t("friends.search.hint")}</p>
      {failure && <ErrorNotice failure={failure} />}
      {valid && !failure && (users === null
        ? <Loading />
        : users.length === 0
          ? <p role="status" className="text-sm">{t("friends.search.empty")}</p>
          : (
            <ul className="flex flex-col gap-2">
              {users.map((user) => (
                <SearchResult key={user.id} user={user} isFriend={friendIds.has(user.id)} onAdded={onAdded} />
              ))}
            </ul>
          ))}
    </div>
  );
}

function SearchResult({ user, isFriend, onAdded }: {
  user: PublicUser;
  isFriend: boolean;
  onAdded: (friend: Friend) => void;
}) {
  const { t } = useTranslation("profile");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);

  async function add() {
    setBusy(true);
    setFailure(null);
    try {
      onAdded(await apiFetch<Friend>(`/api/users/me/friends/${user.id}`, { method: "PUT" }));
    } catch (error) {
      setFailure(toFailure(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <Avatar user={user} />
        <Link to={`/users/${user.id}`} className={`${linkClass} min-w-0 flex-1 truncate`}>{user.username}</Link>
        {isFriend
          ? <span className="text-sm text-bone/70">{t("friends.search.isFriend")}</span>
          : (
            <button type="button" onClick={add} disabled={busy} className={buttonPrimary}
              aria-label={t("friends.search.addNamed", { username: user.username })}>
              {t("friends.search.add")}
            </button>
          )}
      </div>
      {failure && <ErrorNotice failure={failure} />}
    </li>
  );
}
