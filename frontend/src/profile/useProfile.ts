import { useEffect, useState } from "react";
import { apiFetch } from "../api/client";
import type { ProfileUser } from "../api/types";
import { toFailure, type Failure } from "../components/ErrorNotice";

// GET /api/users/{id}. Quem usa recebe um key por User, então trocar de perfil começa do zero;
// o cancelled só descarta a resposta de quem já saiu da tela
export function useProfile(userId: number) {
  const [profile, setProfile] = useState<ProfileUser | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<ProfileUser>(`/api/users/${userId}`)
      .then((loaded) => {
        if (!cancelled)
          setProfile(loaded);
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setFailure(toFailure(error));
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { profile, setProfile, failure };
}
