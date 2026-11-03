import { http, HttpResponse } from "msw";
import authResponse from "./fixtures/authResponse.json";

// API de usuários (i18n.md §2.7). O PATCH devolve o PrivateUser do mock com o que mudou
export const usersHandlers = [
  http.patch("/api/users/me", async ({ request }) => {
    const changes = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ ...authResponse.user, ...changes });
  }),
];
