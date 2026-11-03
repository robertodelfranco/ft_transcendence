import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { StrictMode, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../api/client";
import i18n from "../i18n";
import authResponse from "../mocks/fixtures/authResponse.json";
import unauthorized from "../mocks/fixtures/unauthorized.json";
import { MOCK_PASSWORD } from "../mocks/handlers";
import { server } from "../mocks/server";
import { AuthProvider, ProfileUpdateCancelled, useAuth } from "./AuthContext";
import { getAccessToken, setAccessToken } from "./token";

function Probe() {
  const { status, user, login, logout, updateProfile } = useAuth();
  const [outcome, setOutcome] = useState("-"); // como terminou o último updateProfile
  return (
    <div>
      <p data-testid="status">{status}</p>
      <p data-testid="user">{user?.username ??"-"}</p>
      <p data-testid="language">{user?.preferred_language ?? "-"}</p>
      <p data-testid="outcome">{outcome}</p>
      <button
        onClick={() =>
          updateProfile({ preferred_language: "es" }).then(
            () => setOutcome("gravado"),
            (error: unknown) =>
              setOutcome(error instanceof ProfileUpdateCancelled ? "cancelado" : "erro"),
          )
        }
      >
        perfil
      </button>
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

// Segunda conta, para os testes de troca de conta: outro id, outro token, outro idioma
const otherAccount = {
  ...authResponse,
  access_token: "token-da-isaac",
  user: { ...authResponse.user, id: 8, username: "isaac", email: "isaac@example.com", preferred_language: "en" },
};
const bearerA = `Bearer ${authResponse.access_token}`;
const bearerB = `Bearer ${otherAccount.access_token}`;

// PATCH /api/users/me que só responde quando o teste manda. `sent` guarda o token de cada PATCH
// que chegou ao servidor, e a resposta é o user dono desse token com a mudança aplicada
function holdPatches() {
  const sent: string[] = [];
  const release: Array<() => void> = [];
  server.use(
    http.patch("/api/users/me", async ({ request }) => {
      const token = request.headers.get("Authorization") ?? "";
      sent.push(token);
      const changes = (await request.json()) as object;
      await new Promise<void>((resolve) => release.push(resolve));
      const owner = token === bearerB ? otherAccount.user : authResponse.user;
      return HttpResponse.json({ ...owner, ...changes });
    }),
  );
  return { sent, release };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

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

describe("updateProfile ao trocar de sessão", () => {
  it("sair e entrar com outra conta: o PATCH da fila não sai com o token novo, e a resposta atrasada não vira o user dela", async () => {
    const { sent, release } = holdPatches();
    const user = userEvent.setup();
    await reloadWithSession();
    renderProbe();
    await waitFor(() => expect(status()).toBe("authenticated"));

    await user.click(screen.getByText("perfil")); // em voo, com o token de A
    await user.click(screen.getByText("perfil")); // na fila
    await waitFor(() => expect(sent).toHaveLength(1));

    await user.click(screen.getByText("sair"));
    await waitFor(() => expect(status()).toBe("anonymous"));
    server.use(http.post("/api/auth/login", () => HttpResponse.json(otherAccount)));
    await user.click(screen.getByText("entrar"));
    await waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent("isaac"));

    release[0](); // a resposta de A chega com B já logado
    await settle();
    release[1]?.();
    await settle();

    expect(sent).toEqual([bearerA]);
    expect(screen.getByTestId("user")).toHaveTextContent("isaac");
    expect(screen.getByTestId("language")).toHaveTextContent("en");
    expect(screen.getByTestId("outcome")).toHaveTextContent("cancelado");
  });

  it("sair já encerra a fila: depois do logout, nada mais sai, nem sem token", async () => {
    const { sent, release } = holdPatches();
    const user = userEvent.setup();
    await reloadWithSession();
    renderProbe();
    await waitFor(() => expect(status()).toBe("authenticated"));

    await user.click(screen.getByText("perfil"));
    await user.click(screen.getByText("perfil"));
    await waitFor(() => expect(sent).toHaveLength(1));
    await user.click(screen.getByText("sair"));
    await waitFor(() => expect(status()).toBe("anonymous"));

    release[0](); // ninguém entrou ainda
    await settle();
    release[1]?.();
    await settle();

    expect(sent).toEqual([bearerA]);
    expect(screen.getByTestId("outcome")).toHaveTextContent("cancelado");
  });

  it("um 401 atrasado de A não é repetido com o token de B", async () => {
    const sent: string[] = [];
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    server.use(
      http.patch("/api/users/me", async ({ request }) => {
        sent.push(request.headers.get("Authorization") ?? "");
        await held;
        return HttpResponse.json(unauthorized, { status: 401 });
      }),
    );
    const user = userEvent.setup();
    await reloadWithSession();
    renderProbe();
    await waitFor(() => expect(status()).toBe("authenticated"));

    await user.click(screen.getByText("perfil"));
    await waitFor(() => expect(sent).toHaveLength(1));
    // B entra; daqui em diante o cookie de refresh é o dele
    server.use(
      http.post("/api/auth/login", () => HttpResponse.json(otherAccount)),
      http.post("/api/auth/refresh", () => HttpResponse.json(otherAccount)),
    );
    await user.click(screen.getByText("entrar"));
    await waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent("isaac"));

    release(); // sem o abort, o apiFetch renovaria (vindo B) e repetiria o PATCH de A como B
    await settle();

    expect(sent).toEqual([bearerA]);
    expect(screen.getByTestId("user")).toHaveTextContent("isaac");
  });

  it("entrar com outra conta sem sair antes também encerra a fila", async () => {
    const { sent, release } = holdPatches();
    const user = userEvent.setup();
    await reloadWithSession();
    renderProbe();
    await waitFor(() => expect(status()).toBe("authenticated"));

    await user.click(screen.getByText("perfil"));
    await user.click(screen.getByText("perfil"));
    await waitFor(() => expect(sent).toHaveLength(1));
    server.use(http.post("/api/auth/login", () => HttpResponse.json(otherAccount)));
    await user.click(screen.getByText("entrar"));
    await waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent("isaac"));

    release[0]();
    await settle();
    release[1]?.();
    await settle();

    expect(sent).toEqual([bearerA]);
    expect(screen.getByTestId("user")).toHaveTextContent("isaac");
    expect(screen.getByTestId("language")).toHaveTextContent("en");
  });

  it("a nova conta não espera a fila da anterior: o PATCH dela sai na hora", async () => {
    const { sent, release } = holdPatches();
    const user = userEvent.setup();
    await reloadWithSession();
    renderProbe();
    await waitFor(() => expect(status()).toBe("authenticated"));

    await user.click(screen.getByText("perfil")); // o de A fica pendurado para sempre
    await waitFor(() => expect(sent).toHaveLength(1));
    await user.click(screen.getByText("sair"));
    server.use(http.post("/api/auth/login", () => HttpResponse.json(otherAccount)));
    await user.click(screen.getByText("entrar"));
    await waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent("isaac"));

    await user.click(screen.getByText("perfil"));
    await waitFor(() => expect(sent).toEqual([bearerA, bearerB]));
    release[1]();
    await waitFor(() => expect(screen.getByTestId("language")).toHaveTextContent("es"));
    expect(screen.getByTestId("user")).toHaveTextContent("isaac");
    expect(screen.getByTestId("outcome")).toHaveTextContent("gravado");
  });

  it("sessão perdida no meio do PATCH: a fila para, e o PATCH termina cancelado, não em erro", async () => {
    const sent: string[] = [];
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    server.use(
      http.patch("/api/users/me", async ({ request }) => {
        sent.push(request.headers.get("Authorization") ?? "");
        await held; // o segundo PATCH fica na fila enquanto o primeiro espera
        return HttpResponse.json(unauthorized, { status: 401 });
      }),
    );
    const user = userEvent.setup();
    await reloadWithSession();
    renderProbe();
    await waitFor(() => expect(status()).toBe("authenticated"));
    server.use(http.post("/api/auth/refresh", () => HttpResponse.json({ authenticated: false })));

    await user.click(screen.getByText("perfil"));
    await user.click(screen.getByText("perfil"));
    await waitFor(() => expect(sent).toHaveLength(1));
    release(); // 401, e o refresh é recusado: a sessão acabou
    await waitFor(() => expect(status()).toBe("anonymous"));
    await settle();

    expect(sent).toEqual([bearerA]);
    expect(screen.getByTestId("outcome")).toHaveTextContent("cancelado");
  });
});

describe("updateProfile e a renovação do token", () => {
  afterEach(() => vi.useRealTimers());

  // a carga da página entra com a conta A; a renovação devolve `renewed`
  async function startWithRenewalTo(renewed: typeof authResponse) {
    await reloadWithSession();
    let calls = 0;
    server.use(
      http.post("/api/auth/refresh", () => {
        calls += 1;
        return HttpResponse.json({ ...(calls === 1 ? authResponse : renewed), expires_in: 100 });
      }),
    );
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    renderProbe();
    await vi.waitFor(() => expect(status()).toBe("authenticated"));
  }

  it("renovar o token da mesma conta não cancela o PATCH em voo", async () => {
    const { sent, release } = holdPatches();
    await startWithRenewalTo(authResponse);

    fireEvent.click(screen.getByText("perfil"));
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(81_000); // passou de 80 % de 100 s: renovou
    });
    release[0]();

    await vi.waitFor(() => expect(screen.getByTestId("outcome")).toHaveTextContent("gravado"));
    expect(screen.getByTestId("language")).toHaveTextContent("es");
  });

  it("renovação que volta com outra conta (outra aba trocou o cookie) encerra a fila", async () => {
    const { sent, release } = holdPatches();
    await startWithRenewalTo(otherAccount);

    fireEvent.click(screen.getByText("perfil"));
    fireEvent.click(screen.getByText("perfil"));
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(81_000);
    });
    await vi.waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent("isaac"));

    release[0]();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    release[1]?.();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(sent).toEqual([bearerA]);
    expect(screen.getByTestId("user")).toHaveTextContent("isaac");
    expect(screen.getByTestId("language")).toHaveTextContent("en");
    expect(screen.getByTestId("outcome")).toHaveTextContent("cancelado");
  });

  // A renovação sai e fica presa no servidor; o PATCH grava; depois chega a resposta dela
  async function patchDuringRenewal(renewed: typeof authResponse) {
    await reloadWithSession();
    let calls = 0;
    let releaseRenewal!: () => void;
    const renewalHeld = new Promise<void>((resolve) => (releaseRenewal = resolve));
    server.use(
      http.post("/api/auth/refresh", async () => {
        calls += 1;
        if (calls === 1)
          return HttpResponse.json({ ...authResponse, expires_in: 100 });
        await renewalHeld; // o servidor leu o user antes do PATCH
        return HttpResponse.json({ ...renewed, expires_in: 100 });
      }),
    );
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    renderProbe();
    await vi.waitFor(() => expect(status()).toBe("authenticated"));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(81_000);
    });
    await vi.waitFor(() => expect(calls).toBe(2));
    fireEvent.click(screen.getByText("perfil"));
    await vi.waitFor(() => expect(screen.getByTestId("outcome")).toHaveTextContent("gravado"));

    releaseRenewal();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
  }

  it("uma renovação que saiu antes do PATCH não desfaz o user que ele gravou", async () => {
    await patchDuringRenewal(authResponse); // ainda com pt-BR
    expect(screen.getByTestId("language")).toHaveTextContent("es");
  });

  it("se essa renovação volta com outra conta, o user é o dela, não o que o PATCH gravou", async () => {
    await patchDuringRenewal(otherAccount);
    expect(screen.getByTestId("user")).toHaveTextContent("isaac");
    expect(screen.getByTestId("language")).toHaveTextContent("en");
  });

  it("sem PATCH no meio, a renovação traz o user do servidor (mudado em outra aba)", async () => {
    await startWithRenewalTo({ ...authResponse, user: { ...authResponse.user, username: "augusto_novo" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(81_000);
    });
    await vi.waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent("augusto_novo"));
  });
});
