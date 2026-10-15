import { http, HttpResponse } from "msw";
import authResponse from "./fixtures/authResponse.json";
import emailTaken from "./fixtures/emailTaken.json";
import invalidCredentials from "./fixtures/invalidCredentials.json";
import unauthorized from "./fixtures/unauthorized.json";

// Senha aceita pelo mock (a do exemplo do auth §3)
export const MOCK_PASSWORD = "osDda42";

// o cookie HttpOnly de refresh não existe no mock: esta variável faz o papel dele
let loggedIn = false;

export function resetMockSession(): void {
	loggedIn = false;
}

type Credentials = { email?: string; password?: string };

export const handlers = [
	// Sem sessão é 200, não 401: console limpo (auth.md §4, decisão 4)
	http.post("/api/auth/refresh", () =>
		HttpResponse.json(loggedIn ? authResponse : { authenticated: false }),
	),

	http.post("/api/auth/login", async ({ request }) => {
		const body = (await request.json()) as Credentials;
		if (body.password !== MOCK_PASSWORD)
			return HttpResponse.json(invalidCredentials, { status: 401 });
		loggedIn = true;
		return HttpResponse.json(authResponse);
	}),

	http.post("/api/auth/signup", async ({ request }) => {
		const body = (await request.json()) as Credentials;
		if (body.email === authResponse.user.email)
			return HttpResponse.json(emailTaken, { status: 409 });
		loggedIn = true;
		return HttpResponse.json(authResponse, { status: 201 });
	}),

	// Sempre 204, com ou sem sessão (auth.md §2.2)
	http.post("/api/auth/logout", () => {
		loggedIn = false;
		return new HttpResponse(null, { status: 204 });
	}),

	// Só aceita o token do mock: é o que deixa testar o "401 -> refresh -> repete" do cliente
	http.get("/api/auth/me", ({ request }) =>
		request.headers.get("Authorization") === `Bearer ${authResponse.access_token}`
				? HttpResponse.json(authResponse.user)
				: HttpResponse.json(unauthorized, { status: 401 }),
	),
];