import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAccessToken, setAccessToken } from "../auth/token";
import authResponse from "../mocks/fixtures/authResponse.json";
import validationError from "../mocks/fixtures/validationError.json";
import { MOCK_PASSWORD } from "../mocks/handlers";
import { server } from "../mocks/server";
import { ApiError, apiFetch, setSessionLostHandler } from "./client";

beforeEach(() => {
  setAccessToken(null);
  setSessionLostHandler(null);
});

// Pega o ApiError lançado, para conferir os campos
async function failure(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiError)
      return error;
  }
  throw new Error("esperava um ApiError");
}

describe("apiFetch: erros", () => {
  it("lê o envelope: status, code, fields e request_id", async () => {
    server.use(http.post("/api/x", () => HttpResponse.json(validationError, { status: 422 })));
    const error = await failure(apiFetch("/api/x", {method: "POST" }));
    expect(error).toMatchObject({
      status: 422,
      code: "validation_error",
      fields: { username: "invalid_format", password: "weak_password" },
      requestId: "b7e2c3d4",
    });
  });

  it("falha de rede vira network_error", async () => {
    server.use(http.get("/api/x", () => HttpResponse.error()));
    expect(await failure(apiFetch("/api/x"))).toMatchObject({ code: "network_error", status: 0 });
  });

  it("corpo que não é JSON (502 do Nginx) vira unknown", async () => {
    server.use(http.get("/api/x", () => new HttpResponse("<html>Bad Gateway</html>", { status: 502 })));
    expect(await failure(apiFetch("/api/x"))).toMatchObject({ code: "unknown", status: 502 });
  });

  it("login com senha errada é 401, mas não tenta renovar a sessão", async () => {
    const refresh = vi.fn();
    server.use(http.post("/api/auth/refresh", () => { refresh();
      return HttpResponse.json({ authenticated: false });
    }));
    const error = await failure(
      apiFetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "a@b.c", password: "errada123"}) }),
    );
    expect(error.code).toBe("invalid_credentials");
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("apiFetch: 401 e refresh", () => {
  it("token vencido: renova uma vez e repete e requisição", async () => {
    // loga no mock (liga o "cookie") e depois estraga o token
    await apiFetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "a@b.c", password: MOCK_PASSWORD}) });
    setAccessToken("token-vencido");

    const user = await apiFetch<{ username: string }>("/api/auth/me");

    expect(user.username).toBe("augusto");
    expect(getAccessToken()).toBe(authResponse.access_token);
  });

  it("sem sessão: avisa que a sessão acabou e repassa o 401", async () => {
    const lost = vi.fn();
    setSessionLostHandler(lost);
    const error = await failure(apiFetch("/api/auth/me")); // mock deslogado
    expect(error.code).toBe("unauthorized");
    expect(lost).toHaveBeenCalledOnce();
  });

  it("401 que insiste depois do refresh não vira laço", async () => {
    await apiFetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "a@b.c", password: MOCK_PASSWORD}) });
    const refreshed = vi.fn();
    server.use(
      http.get("/api/y", () => HttpResponse.json({ error: { code: "unauthorized" } }, { status: 401 })),
      http.post("/api/auth/refresh", () => {refreshed(); return HttpResponse.json(authResponse); }),
    );
    const lost = vi.fn();
    setSessionLostHandler(lost);

    await failure(apiFetch("/api/y"));

    expect(refreshed).toHaveBeenCalledOnce();
    expect(lost).toHaveBeenCalledOnce();
  });

  it("três requisições com 401 ao mesmo tempo fazem um refresh só", async () => {
    await apiFetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "a@b.c", password: MOCK_PASSWORD }) });
    setAccessToken("token-vencido");
    const refreshed = vi.fn();
    server.use(http.post("/api/auth/refresh", () => { refreshed(); return HttpResponse.json(authResponse); }));

    await Promise.all([apiFetch("/api/auth/me"), apiFetch("/api/auth/me"), apiFetch("/api/auth/me")]);

    expect(refreshed).toHaveBeenCalledOnce();
  });
});