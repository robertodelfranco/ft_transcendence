import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { beforeEach, describe, expect, it } from "vitest";
import { setAccessToken } from "../auth/token";
import i18n from "../i18n";
import { MOCK_PASSWORD } from "../mocks/handlers";
import { server } from "../mocks/server";
import { routes } from "../routes";

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

// Espera o /refresh responder "sem sessão" e a tela aparecer
async function openLogin(path = "/login") {
  const router = renderAt(path);
  await screen.findByRole("heading", { name: "Sign in" });
  return router;
}

async function fillAndSubmit(email: string, password: string) {
  const user = userEvent.setup();
  if (email)
    await user.type(screen.getByLabelText("Email"), email);
  if (password)
    await user.type(screen.getByLabelText("Password"), password);
  await user.click(screen.getByRole("button", { name: "Sign in" }));
  return user;
}

beforeEach(async () => {
  localStorage.clear();
  setAccessToken(null);
  await i18n.changeLanguage("en");
});

describe("Login: envio", () => {
  it("login certo vai para o ?next", async () => {
    const router = await openLogin("/login?next=%2Fprivacy");
    await fillAndSubmit("augusto@example.com", MOCK_PASSWORD);
    await waitFor(() => expect(router.state.location.pathname).toBe("/privacy"));
  });

  it("sem ?next, vai para o /lobby", async () => {
    const router = await openLogin();
    await fillAndSubmit("augusto@example.com", MOCK_PASSWORD);
    await waitFor(() => expect(router.state.location.pathname).toBe("/lobby"));
  });

  it("manda o e-mail normalizado", async () => {
    let sent: unknown;
    server.use(
      http.post("/api/auth/login", async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({ error: { code: "invalid_credentials" } }, { status: 401 });
      }),
    );
    await openLogin();
    await fillAndSubmit("  Augusto@Example.com ", "x");
    await screen.findByRole("alert");
    expect(sent).toEqual({ email: "augusto@example.com", password: "x" });
  });

  it("401: mostra o erro geral e reabilita o botão", async () => {
    await openLogin();
    await fillAndSubmit("augusto@example.com", "errada");
    expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect email or password.");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });

  it("422: o code de cada campo aparece junto do campo, e o foco vai para ele", async () => {
    server.use(
      http.post("/api/auth/login", () =>
        HttpResponse.json(
          { error: { code: "validation_error", request_id: "r1", fields: { email: "invalid_format" } } },
          { status: 422 },
        ),
      ),
    );
    await openLogin();
    await fillAndSubmit("ana@x.com", "x");
    const email = screen.getByLabelText("Email");
    await waitFor(() => expect(email).toHaveAccessibleDescription("Invalid format."));
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(email).toHaveFocus();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("422 sem campo desta tela: cai no erro geral", async () => {
    server.use(
      http.post("/api/auth/login", () =>
        HttpResponse.json(
          { error: { code: "validation_error", fields: { extra: "invalid_value" } } },
          { status: 422 },
        ),
      ),
    );
    await openLogin();
    await fillAndSubmit("ana@x.com", "x");
    expect(await screen.findByRole("alert")).toHaveTextContent("Some data is invalid.");
  });

  it("falha de rede vira network_error", async () => {
    server.use(http.post("/api/auth/login", () => HttpResponse.error()));
    await openLogin();
    await fillAndSubmit("ana@x.com", "x");
    expect(await screen.findByRole("alert")).toHaveTextContent("No connection to the server.");
  });

  it("code desconhecido mostra o request_id", async () => {
    server.use(
      http.post("/api/auth/login", () =>
        HttpResponse.json({ error: { code: "teapot", request_id: "abc123" } }, { status: 418 }),
      ),
    );
    await openLogin();
    await fillAndSubmit("ana@x.com", "x");
    expect(await screen.findByRole("alert")).toHaveTextContent("abc123");
  });

  it("botão desabilitado enquanto envia", async () => {
    server.use(
      http.post("/api/auth/login", async () => {
        await delay(50);
        return HttpResponse.json({ error: { code: "invalid_credentials" } }, { status: 401 });
      }),
    );
    await openLogin();
    await fillAndSubmit("ana@x.com", "x");
    expect(screen.getByRole("button", { name: "Signing in…" })).toBeDisabled();
    expect(await screen.findByRole("button", { name: "Sign in" })).toBeEnabled();
  });
});

describe("Login: validação no front", () => {
  it("envio vazio: acusa os dois campos, foca o primeiro e não chama o backend", async () => {
    let called = false;
    server.use(
      http.post("/api/auth/login", () => {
        called = true;
        return HttpResponse.json({}, { status: 500 });
      }),
    );
    await openLogin();
    await fillAndSubmit("", "");
    expect(screen.getByLabelText("Email")).toHaveAccessibleDescription("Required.");
    expect(screen.getByLabelText("Password")).toHaveAccessibleDescription("Required.");
    expect(screen.getByLabelText("Email")).toHaveFocus();
    expect(called).toBe(false);
  });

  it("no blur: valor inválido acusa, campo vazio não", async () => {
    await openLogin();
    const user = userEvent.setup();
    await user.click(screen.getByLabelText("Email"));
    await user.tab();
    expect(screen.getByLabelText("Email")).not.toHaveAccessibleDescription();

    await user.type(screen.getByLabelText("Email"), "ana");
    await user.tab();
    expect(screen.getByLabelText("Email")).toHaveAccessibleDescription("Invalid format.");
  });

  it("o erro some assim que o valor fica certo", async () => {
    await openLogin();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), "ana@x");
    await user.tab();
    expect(screen.getByLabelText("Email")).toHaveAccessibleDescription("Invalid format.");

    await user.type(screen.getByLabelText("Email"), ".com");
    expect(screen.getByLabelText("Email")).not.toHaveAccessibleDescription();
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "false");
  });

  it("senha \"fraca\" passa no login", async () => {
    await openLogin();
    await fillAndSubmit("ana@x.com", "abcdefgh");
    expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect email or password.");
  });
});

describe("Login: ?error= do OAuth", () => {
  it("traduz o code", async () => {
    await openLogin("/login?error=oauth_cancelled");
    expect(screen.getByRole("alert")).toHaveTextContent("You cancelled the sign-in with the provider.");
  });

  it("code forjado na URL vira o genérico, sem a chave crua", async () => {
    await openLogin("/login?error=%3Cscript%3E");
    expect(screen.getByRole("alert")).toHaveTextContent(/^Something went wrong\.$/);
  });
});

describe("Login: links e idioma", () => {
  it("o link de cadastro leva o ?next junto", async () => {
    await openLogin("/login?next=%2Fprivacy");
    expect(screen.getByRole("link", { name: "Create an account" }))
      .toHaveAttribute("href", "/signup?next=%2Fprivacy");
  });

  it("a mensagem de erro do campo acompanha o idioma", async () => {
    await openLogin();
    await fillAndSubmit("", "");
    await userEvent.setup().selectOptions(screen.getByLabelText("Language"), "es");
    expect(screen.getByLabelText("Correo electrónico")).toHaveAccessibleDescription();
    expect(document.title).toBe("Iniciar sesión · Catacombs 42");
  });
});
