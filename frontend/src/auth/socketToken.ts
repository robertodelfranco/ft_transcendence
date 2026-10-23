import { refreshSession, reportSessionLost } from "../api/client";
import { getAccessToken } from "./token";

// Token para o join dos dois sockets (/ws/app e /ws/game), com o mesmo contrato:
// fresh só depois de um 4401; null = a sessão acabou; exceção (rede, 429, 5xx) = o socket tenta de novo
export async function socketToken(fresh: boolean): Promise<string | null> {
  const stored = fresh ? null : getAccessToken();
  if (stored)
    return stored;
  const auth = await refreshSession();
  if (!auth)
    reportSessionLost();
  return auth?.access_token ?? null;
}