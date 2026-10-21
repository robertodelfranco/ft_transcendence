import { ws } from "msw";
import authResponse from "./fixtures/authResponse.json";

// O /ws/app do mock (ws-manager.md §2.4): responde ao join e deixa o lobby do mock publicar
export const appSocket = ws.link("*/ws/app");

// Manda para todo /ws/app aberto, como o broadcast_all do ConnectionManager
export function publish(message: object): void {
  appSocket.broadcast(JSON.stringify({ v: 1, ...message }));
}

export const appSocketHandlers = [
  appSocket.addEventListener("connection", ({ client }) => {
    client.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as { type?: string; token?: string };
      if (message.type !== "join")
        return client.close(4400, "invalid_message");
      // Só o token do mock vale, como no /api/auth/me: é o que deixa testar o 4401
      if (message.token !== authResponse.access_token)
        return client.close(4401, "unauthenticated");
      client.send(JSON.stringify({
        v: 1, type: "welcome", user_id: authResponse.user.id, online_friends: [],
      }));
    });
  }),
];
