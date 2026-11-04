import { http, HttpResponse } from "msw";
import type { PublicUser } from "../api/types";
import authResponse from "./fixtures/authResponse.json";
import users from "./fixtures/users.json";

const me = authResponse.user;

// Amizade unilateral do User do mock: friend_id → since. O roberto já é amigo
let friends = new Map<number, string>();
let avatarUploads = 0; // cada envio ganha um nome novo, como no backend

export function resetMockUsers(): void {
  friends = new Map([[3, "2026-10-20T18:00:00Z"]]);
  avatarUploads = 0;
}
resetMockUsers();

// Envelope de erro do auth.md §2.5; `message` é texto de log, aqui só repete o code
function apiError(status: number, code: string) {
  return HttpResponse.json(
    { error: { code, message: code, request_id: "mock0001", fields: null } },
    { status },
  );
}

// O PublicUser de cada User do mock, inclusive o próprio (sem e-mail nem idioma)
function findUser(id: unknown): PublicUser | undefined {
  const { id: myId, username, avatar_url, created_at } = me;
  return [{ id: myId, username, avatar_url, created_at }, ...users.items]
    .find((user) => user.id === Number(id));
}

// API de usuários (i18n.md §2.7)
export const usersHandlers = [
  // O PATCH devolve o PrivateUser do mock com o que mudou
  http.patch("/api/users/me", async ({ request }) => {
    const changes = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ ...authResponse.user, ...changes });
  }),

  // O PUT devolve o PrivateUser com um avatar novo; o DELETE volta ao padrão
  http.put("/api/users/me/avatar", () => {
    avatarUploads += 1;
    return HttpResponse.json({ ...authResponse.user, avatar_url: `/media/avatars/7-mock${avatarUploads}.png` });
  }),

  http.delete("/api/users/me/avatar", () =>
    HttpResponse.json({ ...authResponse.user, avatar_url: "/media/avatars/default.png" })),

  http.get("/api/users/:userId", ({ params }) => {
    const user = findUser(params.userId);
    if (!user)
      return apiError(404, "user_not_found");
    return HttpResponse.json({ ...user, is_friend: friends.has(user.id), is_me: user.id === me.id });
  }),

  http.put("/api/users/me/friends/:userId", ({ params }) => {
    const user = findUser(params.userId);
    if (!user)
      return apiError(404, "user_not_found");
    if (user.id === me.id)
      return apiError(409, "cannot_friend_self");
    if (!friends.has(user.id))
      friends.set(user.id, new Date().toISOString());
    return HttpResponse.json({ ...user, online: false, since: friends.get(user.id) });
  }),

  http.delete("/api/users/me/friends/:userId", ({ params }) => {
    friends.delete(Number(params.userId));
    return new HttpResponse(null, { status: 204 });
  }),
];
