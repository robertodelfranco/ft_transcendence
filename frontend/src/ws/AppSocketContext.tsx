import {
  createContext, useCallback, useContext, useEffect, useEffectEvent, useMemo, useRef, useState,
  type ReactNode,
} from "react";
import { refreshSession, reportSessionLost } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { getAccessToken } from "../auth/token";
import { appSocketUrl, createAppSocket, type AppServerMessage, type AppSocketError } from "./appSocket";

// connecting: até o primeiro welcome · online: welcome recebido · reconnecting: caiu e está voltando ·
// closed: sem sessão, ou parou de vez (ver `error`)
export type AppSocketStatus = "connecting" | "online" | "reconnecting" | "closed";

type Listener = (message: AppServerMessage) => void;

interface AppSocketContextValue {
  status: AppSocketStatus;
  error: AppSocketError | null;
  subscribe: (listener: Listener) => () => void;
}

const AppSocketContext = createContext<AppSocketContextValue | null>(null);

// Depois de um 4401, o token da memória já foi recusado: pede outro pelo cookie de refresh
async function tokenFor(fresh: boolean): Promise<string | null> {
  if (!fresh)
    return getAccessToken();
  const auth = await refreshSession();
  return auth?.access_token ?? null;
}

export function AppSocketProvider({ children }: { children: ReactNode }) {
  const { status: authStatus } = useAuth();
  const [socketStatus, setSocketStatus] = useState<AppSocketStatus>("connecting");
  const [error, setError] = useState<AppSocketError | null>(null);
  // Quem assina fica num Set fora do estado: assinar ou sair não redesenha a árvore
  const listeners = useRef(new Set<Listener>());

  // Um socket por sessão: abre no login (ou no refresh ao carregar) e fecha no logout.
  // A renovação do access não reabre nada, porque o token só é usado no join
  useEffect(() => {
    if (authStatus !== "authenticated")
      return;
    const socket = createAppSocket({
      url: appSocketUrl(),
      getAccessToken: tokenFor,
      onMessage: (message) => {
        if (message.type === "welcome")
          setSocketStatus("online");
        for (const listener of listeners.current)
          listener(message);
      },
      onReconnecting: () => setSocketStatus("reconnecting"),
      onClosed: (reason) => {
        setSocketStatus("closed");
        setError(reason);
        // nem o refresh conseguiu um token: a sessão acabou, a casca volta ao login
        if (reason === "unauthenticated")
          reportSessionLost();
      },
    });
    return () => {
      socket.close();
      setSocketStatus("connecting");
      setError(null);
    };
  }, [authStatus]);

  const subscribe = useCallback((listener: Listener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const value = useMemo<AppSocketContextValue>(
    () => ({
      status: authStatus === "authenticated" ? socketStatus : "closed",
      error,
      subscribe,
    }),
    [authStatus, socketStatus, error, subscribe],
  );

  return <AppSocketContext value={value}>{children}</AppSocketContext>;
}

export function useAppSocket(): AppSocketContextValue {
  const value = useContext(AppSocketContext);
  if (!value)
    throw new Error("useAppSocket fora do AppSocketProvider");
  return value;
}

// Recebe as mensagens do /ws/app enquanto o componente estiver montado. O useEffectEvent
// sempre chama a versão mais nova do listener, sem reassinar a cada render
export function useAppMessages(listener: Listener): void {
  const { subscribe } = useAppSocket();
  const onMessage = useEffectEvent(listener);
  useEffect(() => subscribe((message) => onMessage(message)), [subscribe]);
}
