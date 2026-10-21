import { refreshSession, reportSessionLost } from "../api/client";
import { getAccessToken } from "../auth/token";

export function createGameTokenSource(): () => Promise<string> {
  let first = true;
  return async () => {
    const stored = first ? getAccessToken() : null;
    first = false;
    if (stored)
      return stored;
    const auth = await refreshSession();
    if (!auth) {
      reportSessionLost();
      throw new Error("unauthenticated");
    }
    return auth.access_token;
  };
}