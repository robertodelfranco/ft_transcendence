import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../api/client";
import type { Friend } from "../api/types";
import { toFailure, type Failure } from "../components/ErrorNotice";
import { useFriendsPresence } from "../ws/FriendsPresence";

// A ordem da API (i18n.md §2.7): por username
const byUsername = (a: Friend, b: Friend) => a.username.localeCompare(b.username);

// GET /api/users/me/friends ao abrir /friends. O online de cada amigo vai para o store de presença:
// quem virou amigo em outra aba depois do welcome não estaria lá. Depois, a lista só muda pelos
// PUT e DELETE desta tela, sem pedir tudo de novo
export function useFriends() {
  const { setOnline } = useFriendsPresence();
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ items: Friend[] }>("/api/users/me/friends")
      .then(({ items }) => {
        if (cancelled)
          return;
        for (const friend of items)
          setOnline(friend.id, friend.online);
        setFriends(items);
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setFailure(toFailure(error));
      });
    return () => {
      cancelled = true;
    };
  }, [setOnline]);

  const added = useCallback((friend: Friend) => {
    setOnline(friend.id, friend.online);
    setFriends((current) =>
      current && [...current.filter((other) => other.id !== friend.id), friend].sort(byUsername));
  }, [setOnline]);

  const removed = useCallback((userId: number) => {
    setFriends((current) => current && current.filter((friend) => friend.id !== userId));
  }, []);

  return { friends, failure, added, removed };
}
