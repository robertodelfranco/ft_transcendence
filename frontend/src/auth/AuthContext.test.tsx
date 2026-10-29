import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../api/client";
import i18n from "../i18n";
import authResponse from "../mocks/fixtures/authResponse.json";
import { MOCK_PASSWORD } from "../mocks/handlers";
import { server } from "../mocks/server";
import { AuthProvider, useAuth } from "./AuthContext";
import { getAccessToken, setAccessToken } from "./token";

function Probe() {
  const { status, user, login, logout, updateProfile } = useAuth();
  return (
    <div>
      <p data-testid="status">{status}</p>
      <p data-testid="user">{user?.username ??"-"}</p>
      <p data-testid="language">{user?.preferred_language ?? "-"}</p>
      <button onClick={() => updateProfile({ preferred_language: "es" })}>perfil</button>
      <button onClick={() => login("a@b.c", MOCK_PASSWORD)}>entrar</button>
      <button onClick={() => login("a@b.c", "errada123").catch(() => {})}>errar</button>
      <button onClick={() => logout()}>sair</button>
    </div>
  );
}

const renderProbe = () =>
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
const status = () => screen.getByTestId("status").textContent;

// Simula "recarregar a página": o cookie do mock fica ligado, mas o token em memória some
async function reloadWithSession() {
  await apiFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "a@b.c", password: MOCK_PASSWORD }),
  });
  setAccessToken(null);
}

beforeEach(async () => {
  localStorage.clear();
  setAccessToken(null);
  await i18n.changeLanguage("en");
});

describe("AuthProvider", () => {
  it("sem sessão: loading e depois anonymous", async () => {
    renderProbe();
    expect(status()).toBe("loading");
    await waitFor(() => expect(status()).toBe("anonymous"));
  });

  it("com sessão: authenticated, guarda o token e aplica o idioma do perfil", async () => {
    await reloadWithSession();
    renderProbe();
    await waitFor(() => expect(status()).toBe("authenticated"));
    expect(screen.getByTestId("user")).toHaveTextContent("augusto");
    expect(getAccessToken()).toBe(authResponse.access_token);
    expect(i18n.resolvedLanguage).toBe("pt-BR");
  });

  it("login certo autentica; login errado mantém anonymous", async () => {
    const user = userEvent.setup();
    renderProbe();
    await waitFor(() => expect(status()).toBe("anonymous"));
    await user.click(screen.getByText("errar"));
    expect(status()).toBe("anonymous");
    await user.click(screen.getByText("entrar"));
    await waitFor(() => expect(status()).toBe("authenticated"));
  });

  it("logout limpa o token e volta a anonymous", async () => {
    const user = userEvent.setup();
    await reloadWithSession();
    renderProbe();
    await waitFor(() => expect(status()).toBe("authenticated"));
    await user.click(screen.getByText("sair"));
    await waitFor(() => expect(status()).toBe("anonymous"));
    expect(getAccessToken()).toBeNull();
  });

  it("StrictMode: um /refresh só na carga", async () => {
    const refreshed = vi.fn();
    server.use(
      http.post("/api/auth/refresh", () => {
        refreshed();
        return HttpResponse.json({ authenticated: false });
      }),
    );
    render(
      <StrictMode>
        <AuthProvider>
          <Probe />
        </AuthProvider>
      </StrictMode>,
    );
    await waitFor(() => expect(status()).toBe("anonymous"));
    expect(refreshed).toHaveBeenCalledOnce();
  });

  it("sessão perdida (401 e refresh recusado) derruba para anonymous", async () => {
    await reloadWithSession();
    renderProbe();
    await waitFor(() => expect(status()).toBe("authenticated"));
    server.use(http.post("/api/auth/refresh", () => HttpResponse.json({ authenticated: false })));
    setAccessToken("token-vencido");

    await act(async () => {
      await apiFetch("/api/auth/me").catch(() => {});
    });

    await waitFor(() => expect(status()).toBe("anonymous"));
  });
});

describe("renovação a 80 %", () => {
  afterEach(() => vi.useRealTimers());

  it("pede novo refresh quando passa 80 % do expires_in", async () => {
    await reloadWithSession();
    const refreshed = vi.fn();
    server.use(
      http.post("/api/auth/refresh", () => {
        refreshed();
        return HttpResponse.json({ ...authResponse, expires_in: 100 });
      }),
    );
    // Só setTimeout/clearTimeout: se o relógio inteiro for falso, o MSW trava
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    renderProbe();
    await vi.waitFor(() => expect(status()).toBe("authenticated"));
    expect(refreshed).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(79_000); // 79 % de 100 s: ainda não
    });
    expect(refreshed).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000); // passou de 80 %
    });
    await vi.waitFor(() => expect(refreshed).toHaveBeenCalledTimes(2));
  });

  it("atualizar o perfil troca o user, mas não adia a renovação", async () => {
    await reloadWithSession();
    const refreshed = vi.fn();
    server.use(
      http.post("/api/auth/refresh", () => {
        refreshed();
        return HttpResponse.json({ ...authResponse, expires_in: 100 });
      }),
    );
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    renderProbe();
    await vi.waitFor(() => expect(status()).toBe("authenticated"));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(50_000);
    });
    fireEvent.click(screen.getByText("perfil"));
    await vi.waitFor(() => expect(screen.getByTestId("language")).toHaveTextContent("es"));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(31_000); // 81 s desde o login: passou de 80 %
    });
    await vi.waitFor(() => expect(refreshed).toHaveBeenCalledTimes(2));
  });
});
