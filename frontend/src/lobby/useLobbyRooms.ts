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
  // Faz uma ação (join, ready) e aplica a resposta, se nada mais novo chegou no meio do caminho
  runAction: (matchId: number, request: () => Promise<RoomInfo>) => Promise<RoomInfo>;
  reload: () => void;
}

// Rooms abertas, vivas, sem polling (ws-manager.md §2.4, "Como a tela de lobby usa isto"):
// 1. GET /api/matches; as mensagens de lobby que chegam enquanto ele não volta ficam guardadas
// 2. com a resposta, aplica a lista e depois as guardadas, na ordem em que chegaram
// 3. daí em diante, cada lobby_update / lobby_removed muda a lista
// 4. a cada welcome (o socket caiu e voltou), refaz o GET: as mensagens do intervalo se perderam
// 5. a resposta de uma ação nossa só entra se o socket não trouxe nada mais novo da Room enquanto
//    ela estava no ar (runAction)
export function useLobbyRooms(): LobbyRooms {
  const [rooms, setRooms] = useState<RoomInfo[] | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [generation, setGeneration] = useState(0);
  // não-nulo enquanto um GET está no ar: é o buffer do passo 1
  const pending = useRef<AppServerMessage[] | null>(null);
  // Quantas mensagens de lobby chegaram por Room, e quantas listas inteiras o GET já trouxe.
  // Uma resposta HTTP não tem versão: é por estes contadores que se sabe se ela ficou velha
  const updates = useRef(new Map<number, number>());
  const loads = useRef(0);

  useAppMessages((message) => {
    if (message.type === "welcome") {
      setGeneration((current) => current + 1);
      return;
    }
    if (!isLobbyMessage(message))
      return;
    const matchId = message.type === "lobby_update" ? message.room.match_id : message.match_id;
    updates.current.set(matchId, (updates.current.get(matchId) ?? 0) + 1);
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
        loads.current += 1;
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

  // A resposta mostra a Room no instante da ação. Se o socket ou um GET trouxe algo depois que ela
  // saiu, ela é velha e fica de fora: o servidor publica toda mudança, inclusive esta, então o
  // socket entrega o estado certo. Com o socket fora do ar nada chega, e a resposta entra
  const runAction = useCallback(async (matchId: number, request: () => Promise<RoomInfo>) => {
    const stamp = () => `${loads.current}:${updates.current.get(matchId) ?? 0}`;
    const before = stamp();
    const room = await request();
    if (stamp() === before)
      setRooms((current) => current && applyLobbyMessage(current, { v: 1, type: "lobby_update", room }));
    return room;
  }, []);

  const reload = useCallback(() => setGeneration((current) => current + 1), []);

  return { rooms, failure, runAction, reload };
}
