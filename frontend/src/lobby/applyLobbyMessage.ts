import type { RoomInfo } from "../api/types";
import type { AppServerMessage } from "../ws/appSocket";

// Como uma mensagem do /ws/app muda a lista de Rooms abertas (ws-manager.md §2.4). Função pura:
// recebe a lista e devolve outra, sem mexer na que entrou, para o React perceber a mudança
export function applyLobbyMessage(rooms: RoomInfo[], message: AppServerMessage): RoomInfo[] {
  switch (message.type) {
    case "lobby_update": {
      // o RoomInfo vem inteiro, não é delta: substitui pelo match_id, ou entra no fim se é nova
      const { room } = message;
      const exists = rooms.some((current) => current.match_id === room.match_id);
      return exists
        ? rooms.map((current) => (current.match_id === room.match_id ? room : current))
        : [...rooms, room];
    }
    case "lobby_removed":
      return rooms.filter((current) => current.match_id !== message.match_id);
    default:
      return rooms;
  }
}

type LobbyMessage = Extract<AppServerMessage, { type: "lobby_update" | "lobby_removed" }>;

// "message is LobbyMessage": depois do if, o TypeScript sabe que a mensagem tem room ou match_id
export function isLobbyMessage(message: AppServerMessage): message is LobbyMessage {
  return message.type === "lobby_update" || message.type === "lobby_removed";
}
