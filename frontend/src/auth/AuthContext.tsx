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

// O updateProfile não terminou porque a sessão acabou ou trocou de conta: não é erro para mostrar
export class ProfileUpdateCancelled extends Error {
  constructor() {
    super("profile update cancelled");
    this.name = "ProfileUpdateCancelled";
  }
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Renova depois de 80 % do expires_in, antes de o access vencer (auth.md §2.6, passo 2)
const RENEW_AT = 0.8;

export function AuthProvider({ children }: { children: ReactNode }) {
  // undefined = ainda não sabemos (loading); null = sem sessão
  const [session, setSession] = useState<AuthResponse | null | undefined>(undefined);

  // Fila do updateProfile, que é da sessão atual. Entrar, sair, perder a sessão ou trocar de
  // conta aborta tudo o que ela tem: um fetch abortado nem sai, e o que estava em voo não repete
  // com o token da próxima conta nem troca o user dela com uma resposta atrasada
  const profileQueue = useRef<Promise<unknown>>(Promise.resolve());
  const profileAbort = useRef<AbortController>(null);
  const profileSaves = useRef(0); // quantos PATCHes já gravaram: a renovação compara antes e depois
  const endProfileQueue = useCallback(() => {
    profileAbort.current?.abort();
    profileAbort.current = null; // o próximo updateProfile já é da sessão nova
  }, []);

  // Entrada na sessão: guarda o token e aplica o idioma do perfil (i18n.md §2.1, ordem 1)
  const start = useCallback((auth: AuthResponse) => {
    endProfileQueue(); // antes do token novo: nada da conta anterior sai com ele
    setAccessToken(auth.access_token);
    if (auth.user.preferred_language !== i18n.resolvedLanguage)
      changeLanguage(auth.user.preferred_language);
    setSession(auth);
  }, [endProfileQueue]);

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
  const userId = session?.user.id;
  useEffect(() => {
    if (!accessToken || expiresIn === undefined)
      return;
    const timer = setTimeout(() => {
      const saves = profileSaves.current;
      refreshSession()
        .then((auth) => {
          // a sessão acabou, ou outra aba entrou com outra conta (o cookie de refresh é um só)
          if (auth?.user.id !== userId)
            endProfileQueue();
          // um PATCH gravou enquanto a renovação ia e voltava: o user dela pode ser de antes dele
          const stale = profileSaves.current !== saves;
          setSession((current) =>
            auth && stale && current?.user.id === auth.user.id ? { ...auth, user: current.user } : auth);
        })
      .catch(() => {
        // falha de rede: o próximo 401 passa pelo apiFetch, que tenta de novo
      });
    }, expiresIn * RENEW_AT * 1000);
    return () => clearTimeout(timer);
  }, [accessToken, expiresIn, userId, endProfileQueue]);

  // O cliente HTTP avisa quando a sessão acabou de vez (refresh recusado)
  useEffect(() => {
    setSessionLostHandler(() => {
      endProfileQueue();
      setSession(null);
    });
    return () => setSessionLostHandler(null);
  }, [endProfileQueue]);

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
    endProfileQueue(); // quem sai desiste do que ainda não gravou
    try {
      await apiFetch<void>("/api/auth/logout", { method: "POST" });
    } finally {
      // mesmo que a chamada falhe, esta aba deixa de se considerar logada
      setAccessToken(null);
      setSession(null);
    }
  }, [endProfileQueue]);

  // PATCH /api/users/me (i18n.md §2.7): o PrivateUser da resposta passa a ser o da sessão.
  // Um PATCH por vez, na ordem dos cliques: em paralelo, o que chega por último no servidor
  // vence, e o perfil pode guardar uma escolha diferente da que está na tela
  const updateProfile = useCallback((changes: ProfileChanges) => {
    const { signal } = (profileAbort.current ??= new AbortController());
    const update = profileQueue.current.then(async () => {
      const user = await apiFetch<PrivateUser>("/api/users/me", {
        method: "PATCH",
        body: JSON.stringify(changes),
        signal,
      }).catch((error: unknown) => {
        throw signal.aborted ? new ProfileUpdateCancelled() : error;
      });
      if (signal.aborted) // a resposta chegou inteira, mas a sessão trocou antes de chegar aqui
        throw new ProfileUpdateCancelled();
      profileSaves.current += 1;
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
