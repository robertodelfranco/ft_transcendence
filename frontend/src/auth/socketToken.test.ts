import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch, setSessionLostHandler } from "../api/client";
import authResponse from "../mocks/fixtures/authResponse.json";
import { MOCK_PASSWORD } from "../mocks/handlers";
import { server } from "../mocks/server";
import { socketToken } from "./socketToken";
import { getAccessToken, setAccessToken } from "./token";

async function login() {
  await apiFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "a@b.c", password: MOCK_PASSWORD }),
  });
}

const sessionLost = vi.fn();

beforeEach(() => {
  setAccessToken(null);
  sessionLost.mockClear();
  setSessionLostHandler(sessionLost);
});

afterEach(() => setSessionLostHandler(null));

describe("token do join dos sockets", () => {
  // revisão do Augusto no #138: queda de rede ou 4503 não pedem token novo
  it("sem fresh, reaproveita o token da memória a cada join", async () => {
    setAccessToken("da-memoria");
    expect(await socketToken(false)).toBe("da-memoria");
    expect(await socketToken(false)).toBe("da-memoria");
  });

  it("sem fresh e sem token na memória, faz o refresh", async () => {
    await login();
    setAccessToken(null);
    expect(await socketToken(false)).toBe(authResponse.access_token);
  });

  it("fresh (depois de um 4401) renova mesmo com token na memória", async () => {
    await login();
    setAccessToken("vencido");
    expect(await socketToken(true)).toBe(authResponse.access_token);
    expect(getAccessToken()).toBe(authResponse.access_token);
  });

  it("refresh recusado: null e a sessão acaba", async () => {
    expect(await socketToken(true)).toBeNull();
    expect(sessionLost).toHaveBeenCalledOnce();
  });

  // revisão do Augusto no #138: erro passageiro não é sessão perdida; quem tenta de novo é o socket
  it.each([
    ["rede caída", () => HttpResponse.error()],
    ["503", () => HttpResponse.json({ error: { code: "internal_error" } }, { status: 503 })],
    ["429", () => HttpResponse.json({ error: { code: "rate_limited" } }, { status: 429 })],
  ])("refresh com %s rejeita sem encerrar a sessão", async (_, response) => {
    server.use(http.post("/api/auth/refresh", response));
    await expect(socketToken(true)).rejects.toThrow();
    expect(sessionLost).not.toHaveBeenCalled();
  });
});
