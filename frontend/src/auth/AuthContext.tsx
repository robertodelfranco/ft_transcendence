import { 
  createContext, useCallback, useContext, useEffect, useMemo, useState, useRef, type ReactNode
} from "react";
import { apiFetch, refreshSession, setSessionLostHandler } from "../api/client";
import type { AuthResponse, PrivateUser, ProfileChanges } from "../api/types";
import i18n, { changeLanguage } from "../i18n";
import { setAccessToken } from "./token";

export type AuthStatus = "loading" | "anonymous" | "authenticated";

export interface SignupInput {
  email: string;
  username: string;
  password: string;
}

interface AuthContextValue {
  status: AuthStatus;
  user: PrivateUser | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (input: SignupInput) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (changes: ProfileChanges) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Renova depois de 80 % do expires_in, antes de o access vencer (auth.md §2.6, passo 2)
const RENEW_AT = 0.8;

export function AuthProvider({ children }: { children: ReactNode }) {
  // undefined = ainda não sabemos (loading); null = sem sessão
  const [session, setSession] = useState<AuthResponse | null | undefined>(undefined);

  // Entrada na sessão: guarda o token e aplica o idioma do perfil (i18n.md §2.1, ordem 1)
  const start = useCallback((auth: AuthResponse) => {
    setAccessToken(auth.access_token);
    if (auth.user.preferred_language !== i18n.resolvedLanguage)
      changeLanguage(auth.user.preferred_language);
    setSession(auth);
  }, []);

  // Ao carregar a página: o cookie de refresh diz se ainda há sessão
  useEffect(() => {
    let cancelled = false;
    refreshSession()
      .then((auth) => {
        if (cancelled)
          return;
        if (auth)
          start(auth);
        else
          setSession(null);
      })
      .catch(() => {
        // rede caiu ou callback fora: tela pública, sem barulho no console
        if (!cancelled)
          setSession(null);
      });
    return () => {
      cancelled = true;
    };
  }, [start]);

  // Renovação: cada token novo reinicia o timer, e o cleanup cancela o anterior. Depende só do
  // token, não da sessão inteira: o updateProfile troca o user e não pode adiar a renovação
  const accessToken = session?.access_token;
  const expiresIn = session?.expires_in;
  useEffect(() => {
    if (!accessToken || expiresIn === undefined)
      return;
    const timer = setTimeout(() => {
      refreshSession()
        .then((auth) => setSession(auth))
      .catch(() => {
        // falha de rede: o próximo 401 passa pelo apiFetch, que tenta de novo
      });
    }, expiresIn * RENEW_AT * 1000);
    return () => clearTimeout(timer);
  }, [accessToken, expiresIn]);

  // O cliente HTTP avisa quando a sessão acabou de vez (refresh recusado)
  useEffect(() => {
    setSessionLostHandler(() => setSession(null));
    return () => setSessionLostHandler(null);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const auth = await apiFetch<AuthResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      start(auth);
    },
    [start],
  );

  const signup = useCallback(
    async (input: SignupInput) => {
      const auth = await apiFetch<AuthResponse>("/api/auth/signup", {
        method: "POST",
        // o idioma atual da tela vira o do perfil (i18n.md §2.1)
        body: JSON.stringify({ ...input, preferred_language: i18n.resolvedLanguage }),
      });
      start(auth);
    },
    [start],
  );

  const logout = useCallback(async () => {
    try {
      await apiFetch<void>("/api/auth/logout", { method: "POST" });
    } finally {
      // mesmo que a chamada falhe, esta aba deixa de se considerar logada
      setAccessToken(null);
      setSession(null);
    }
  }, []);

  // PATCH /api/users/me (i18n.md §2.7): o PrivateUser da resposta passa a ser o da sessão.
  // Um PATCH por vez, na ordem dos cliques: em paralelo, o que chega por último no servidor
  // vence, e o perfil pode guardar uma escolha diferente da que está na tela
  const profileQueue = useRef<Promise<unknown>>(Promise.resolve());
  const updateProfile = useCallback((changes: ProfileChanges) => {
    const update = profileQueue.current.then(async () => {
      const user = await apiFetch<PrivateUser>("/api/users/me", {
        method: "PATCH",
        body: JSON.stringify(changes),
      });
      setSession((current) => (current ? { ...current, user } : current));
    });
    profileQueue.current = update.catch(() => undefined); // um PATCH que falhou não trava os próximos
    return update;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status: session === undefined ? "loading": session ? "authenticated" : "anonymous",
      user: session?.user ?? null,
      login,
      signup,
      logout,
      updateProfile,
    }),
    [session, login, signup, logout, updateProfile],
  );

  return <AuthContext value={value}>{children}</AuthContext>
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value)
    throw new Error("useAuth fora do AuthProvider");
  return value;
}