import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { AuthProvider, useAuth } from "../auth/AuthContext";
import { setAccessToken } from "../auth/token";
import { appSocket, publish } from "../mocks/appSocketHandlers";
import { MOCK_PASSWORD } from "../mocks/handlers";
import { server } from "../mocks/server";
import { AppSocketProvider } from "./AppSocketContext";
import { FriendsPresenceProvider, useFriendsPresence } from "./FriendsPresence";
import { withPresence } from "./presence";

describe("withPresence", () => {
  it("liga e desliga um User", () => {
    expect([...withPresence(new Set([3]), 5, true)].sort()).toEqual([3, 5]);
    expect([...withPresence(new Set([3, 5]), 3, false)]).toEqual([5]);
  });

  it("sem mudança, devolve o mesmo Set", () => {
    const online = new Set([3]);
    expect(withPresence(online, 3, true)).toBe(online);
    expect(withPresence(online, 5, false)).toBe(online);
  });
});

function Probe() {
  const { login } = useAuth();
  const { isOnline, setOnline } = useFriendsPresence();
  return (
    <div>
      <p data-testid="3">{String(isOnline(3))}</p>
      <p data-testid="5">{String(isOnline(5))}</p>
      <button onClick={() => login("a@b.c", MOCK_PASSWORD)}>entrar</button>
      <button onClick={() => setOnline(5, true)}>adicionou o 5</button>
    </div>
  );
}

const shown = (id: number) => screen.getByTestId(String(id)).textContent;

// Cada welcome do servidor sai com a próxima lista; drop derruba a última conexão aberta
let welcomes: number[][];
let drop: (() => void) | null;

beforeEach(() => {
  setAccessToken(null);
  welcomes = [[3]];
  drop = null;
  server.use(
    appSocket.addEventListener("connection", ({ client }) => {
      drop = () => client.close(1011, "server restart");
      client.addEventListener("message", (event) => {
        event.stopImmediatePropagation();
        const online_friends = welcomes.shift() ?? [];
        client.send(JSON.stringify({ v: 1, type: "welcome", user_id: 7, online_friends }));
      });
    }),
  );
});

async function loginAndWaitWelcome() {
  render(
    <AuthProvider>
      <AppSocketProvider>
        <FriendsPresenceProvider>
          <Probe />
        </FriendsPresenceProvider>
      </AppSocketProvider>
    </AuthProvider>,
  );
  expect(shown(3)).toBe("null"); // sem sessão, ninguém sabe
  await userEvent.click(screen.getByRole("button", { name: "entrar" }));
  await waitFor(() => expect(shown(3)).toBe("true"));
}

describe("FriendsPresenceProvider", () => {
  it("o welcome diz quem já estava online", async () => {
    await loginAndWaitWelcome();
    expect(shown(5)).toBe("false");
  });

  it("o presence liga e desliga cada amigo", async () => {
    await loginAndWaitWelcome();
    act(() => publish({ type: "presence", user_id: 5, online: true }));
    await waitFor(() => expect(shown(5)).toBe("true"));
    act(() => publish({ type: "presence", user_id: 3, online: false }));
    await waitFor(() => expect(shown(3)).toBe("false"));
  });

  it("setOnline marca quem virou amigo depois do welcome", async () => {
    await loginAndWaitWelcome();
    await userEvent.click(screen.getByRole("button", { name: "adicionou o 5" }));
    expect(shown(5)).toBe("true");
  });

  it("reconectando é desconhecido, e o welcome seguinte substitui a lista", async () => {
    welcomes = [[3], [5]];
    await loginAndWaitWelcome();
    act(() => drop?.());
    await waitFor(() => expect(shown(3)).toBe("null"));
    expect(shown(5)).toBe("null");
    // o socket volta depois de ~1 s de espera, e o welcome novo vale inteiro
    await waitFor(() => expect(shown(5)).toBe("true"), { timeout: 3000 });
    expect(shown(3)).toBe("false");
  });
});
