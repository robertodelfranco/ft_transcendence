import { useEffect, useState } from "react";
import { apiFetch } from "../api/client";
import { toFailure, type Failure } from "../components/ErrorNotice";

type Loaded<T> = { path: string; data: T | null; failure: Failure | null };

// GET de leitura que muda com a tela (página do histórico, Mode do leaderboard). A resposta fica
// presa ao caminho que a trouxe: trocar de página não mostra a anterior enquanto a nova não chega,
// e a resposta atrasada de um caminho velho é descartada
export function useApi<T>(path: string) {
  const [loaded, setLoaded] = useState<Loaded<T> | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<T>(path)
      .then((data) => {
        if (!cancelled)
          setLoaded({ path, data, failure: null });
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setLoaded({ path, data: null, failure: toFailure(error) });
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  const current = loaded?.path === path ? loaded : null;
  return { data: current?.data ?? null, failure: current?.failure ?? null };
}
