import { beforeEach, describe, expect, it } from "vitest";
import { apiFetch } from "../api/client";
import { getAccessToken, setAccessToken } from "../auth/token";
import authResponse from "../mocks/fixtures/authResponse.json";
import { MOCK_PASSWORD } from "../mocks/handlers";
import { createGameTokenSource } from "./gameToken";

async function login() {
  await apiFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "a@b.c", password: MOCK_PASSWORD }),
  });
}

beforeEach(() => setAccessToken(null));

describe("token do socket do jogo", () => {
  it("o primeiro join usa o token da memória, sem refresh", async () => {
    setAccessToken("da-memoria");
    expect(await createGameTokenSource()()).toBe("da-memoria");
  });

  it("sem token na memória, o primeiro join já faz o refresh", async () => {
    await login();
    setAccessToken(null);
    expect(await createGameTokenSource()()).toBe(authResponse.access_token);
  });

  // 4401 no meio da partida: o socket só chama de novo, sem dizer que o token venceu
  it("a reconexão sempre pede um token novo", async () => {
    await login();
    setAccessToken("vencido");
    const token = createGameTokenSource();
    expect(await token()).toBe("vencido");
    expect(await token()).toBe(authResponse.access_token);
    expect(getAccessToken()).toBe(authResponse.access_token);
  });

  it("sem sessão, rejeita", async () => {
    await expect(createGameTokenSource()()).rejects.toThrow("unauthenticated");
  });
});
