import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useAppMessages, useAppSocket } from "./AppSocketContext";
import { withPresence } from "./presence";

interface FriendsPresenceValue {
  // true ou false com o /ws/app no ar; null enquanto conecta ou reconecta: desconhecido, nunca
  // offline (i18n.md §2.7)
  isOnline: (userId: number) => boolean | null;
  // quem virou amigo depois do welcome: o PUT de amigo devolve o online dele
  setOnline: (userId: number, online: boolean) => void;
}

const FriendsPresenceContext = createContext<FriendsPresenceValue | null>(null);

// Presença dos amigos para a casca inteira (ws-manager.md §2.3). O welcome traz a lista completa a
// cada conexão e reconexão, e o presence traz cada mudança depois dele. Escuta desde o login, então
// nenhuma tela precisa pedir a presença por HTTP nem guardar mensagens enquanto carrega
export function FriendsPresenceProvider({ children }: { children: ReactNode }) {
  const { status } = useAppSocket();
  const [online, setOnlineIds] = useState<ReadonlySet<number>>(() => new Set());

  useAppMessages((message) => {
    if (message.type === "welcome")
      setOnlineIds(new Set(message.online_friends));
    else if (message.type === "presence")
      setOnlineIds((current) => withPresence(current, message.user_id, message.online));
  });

  const setOnline = useCallback((userId: number, isOnline: boolean) => {
    setOnlineIds((current) => withPresence(current, userId, isOnline));
  }, []);

  const value = useMemo<FriendsPresenceValue>(
    () => ({
      isOnline: (userId) => (status === "online" ? online.has(userId) : null),
      setOnline,
    }),
    [status, online, setOnline],
  );

  return <FriendsPresenceContext value={value}>{children}</FriendsPresenceContext>;
}

export function useFriendsPresence(): FriendsPresenceValue {
  const value = useContext(FriendsPresenceContext);
  if (!value)
    throw new Error("useFriendsPresence fora do FriendsPresenceProvider");
  return value;
}
