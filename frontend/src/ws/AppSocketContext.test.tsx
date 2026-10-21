import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { useState } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { AuthProvider, useAuth } from "../auth/AuthContext";
import { setAccessToken } from "../auth/token";
import { appSocket, publish } from "../mocks/appSocketHandlers";
import { MOCK_PASSWORD } from "../mocks/handlers";
import { server } from "../mocks/server";
import { AppSocketProvider, useAppMessages, useAppSocket } from "./AppSocketContext";

function Probe() {
  const { status: auth, login, logout } = useAuth();
  const { status } = useAppSocket();
  const [last, setLast] = useState("-");
  useAppMessages((message) => setLast(message.type));
  return (
    <div>
      <p data-testid="auth">{auth}</p>
      <p data-testid="socket">{status}</p>
      <p data-testid="last">{last}</p>
      <button onClick={() => login("a@b.c", MOCK_PASSWORD)}>entrar</button>
      <button onClick={() => logout()}>sair</button>
    </div>
  );
}

function renderProbe() {
  render(
    <AuthProvider>
      <AppSocketProvider>
        <Probe />
      </AppSocketProvider>
    </AuthProvider>,
  );
}

const text = (id: string) => screen.getByTestId(id).textContent;

async function loginAndWaitOnline() {
  renderProbe();
  await waitFor(() => expect(text("auth")).toBe("anonymous"));
  await userEvent.click(screen.getByRole("button", { name: "entrar" }));
  await waitFor(() => expect(text("socket")).toBe("online"));
}

// O que o servidor do mock viu: quantas conexões abriram e com que código cada uma fechou
let connections: number;
let closeCodes: number[];

beforeEach(() => {
  setAccessToken(null);
  connections = 0;
  closeCodes = [];
  server.use(
    appSocket.addEventListener("connection", ({ client }) => {
      connections += 1;
      client.addEventListener("close", (event) => closeCodes.push(event.code));
    }),
  );
});

describe("AppSocketProvider", () => {
  it("sem sessão: fica closed e não abre socket", async () => {
    renderProbe();
    await waitFor(() => expect(text("auth")).toBe("anonymous"));
    expect(text("socket")).toBe("closed");
    expect(connections).toBe(0);
  });

  it("depois do login: abre, manda o join e fica online com o welcome", async () => {
    await loginAndWaitOnline();
    expect(text("last")).toBe("welcome");
    expect(connections).toBe(1);
  });

  it("entrega a quem assinou o que o servidor publica", async () => {
    await loginAndWaitOnline();
    act(() => publish({ type: "lobby_removed", match_id: 12, reason: "aborted" }));
    await waitFor(() => expect(text("last")).toBe("lobby_removed"));
  });

  it("logout fecha o socket", async () => {
    await loginAndWaitOnline();
    await userEvent.click(screen.getByRole("button", { name: "sair" }));
    await waitFor(() => expect(text("socket")).toBe("closed"));
    await waitFor(() => expect(closeCodes).toEqual([1000]));
  });

  it("4401 que nem o refresh resolve encerra a sessão", async () => {
    server.use(
      // o servidor recusa todo join, e o cookie de refresh não vale mais
      appSocket.addEventListener("connection", ({ client }) => {
        client.addEventListener("message", (event) => {
          event.stopImmediatePropagation();
          client.close(4401, "unauthenticated");
        });
      }),
      http.post("/api/auth/refresh", () => HttpResponse.json({ authenticated: false })),
    );
    renderProbe();
    await waitFor(() => expect(text("auth")).toBe("anonymous"));
    await userEvent.click(screen.getByRole("button", { name: "entrar" }));
    // o primeiro 4401 reconecta com refresh; sem sessão no refresh, o socket para e a casca sai
    await waitFor(() => expect(closeCodes).toContain(4401));
    await waitFor(() => expect(text("auth")).toBe("anonymous"));
    expect(text("socket")).toBe("closed");
    expect(connections).toBe(2);
  });
});
