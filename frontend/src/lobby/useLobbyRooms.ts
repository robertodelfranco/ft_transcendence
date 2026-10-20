import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../api/client";
import type { RoomInfo, RoomList } from "../api/types";
import { toFailure, type Failure } from "../components/ErrorNotice";
import type { AppServerMessage } from "../ws/appSocket";
import { useAppMessages } from "../ws/AppSocketContext";
import { applyLobbyMessage, isLobbyMessage } from "./applyLobbyMessage";

interface LobbyRooms {
  rooms: RoomInfo[] | null; // null até o primeiro GET voltar
  failure: Failure | null;
  apply: (room: RoomInfo) => void; // a resposta de uma ação nossa (join, ready) entra na hora
  reload: () => void;
}

// Rooms abertas, vivas, sem polling (ws-manager.md §2.4, "Como a tela de lobby usa isto"):
// 1. GET /api/matches; as mensagens de lobby que chegam enquanto ele não volta ficam guardadas
// 2. com a resposta, aplica a lista e depois as guardadas, na ordem em que chegaram
// 3. daí em diante, cada lobby_update / lobby_removed muda a lista
// 4. a cada welcome (o socket caiu e voltou), refaz o GET: as mensagens do intervalo se perderam
export function useLobbyRooms(): LobbyRooms {
  const [rooms, setRooms] = useState<RoomInfo[] | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [generation, setGeneration] = useState(0);
  // não-nulo enquanto um GET está no ar: é o buffer do passo 1
  const pending = useRef<AppServerMessage[] | null>(null);

  useAppMessages((message) => {
    if (message.type === "welcome") {
      setGeneration((current) => current + 1);
      return;
    }
    if (!isLobbyMessage(message))
      return;
    if (pending.current)
      pending.current.push(message);
    else
      setRooms((current) => current && applyLobbyMessage(current, message));
  });

  useEffect(() => {
    let cancelled = false;
    pending.current = [];
    apiFetch<RoomList>("/api/matches")
      .then(({ items }) => {
        if (cancelled)
          return;
        const buffered = pending.current ?? [];
        pending.current = null;
        setRooms(buffered.reduce(applyLobbyMessage, items));
        setFailure(null);
      })
      .catch((error: unknown) => {
        if (cancelled)
          return;
        pending.current = null;
        setFailure(toFailure(error));
      });
    return () => {
      cancelled = true;
    };
  }, [generation]);

  const apply = useCallback((room: RoomInfo) => {
    setRooms((current) => current && applyLobbyMessage(current, { v: 1, type: "lobby_update", room }));
  }, []);

  const reload = useCallback(() => setGeneration((current) => current + 1), []);

  return { rooms, failure, apply, reload };
}
