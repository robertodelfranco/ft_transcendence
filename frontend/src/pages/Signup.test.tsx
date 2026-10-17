import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { beforeEach, describe, expect, it } from "vitest";
import { setAccessToken } from "../auth/token";
import i18n from "../i18n";
import authResponse from "../mocks/fixtures/authResponse.json";
import { server } from "../mocks/server";
import { routes } from "../routes";

async function openSignup(path = "/signup") {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  await screen.findByRole("heading", { name: "Create an account" });
  return router;
}

interface Values {
  email?: string;
  username?: string;
  password?: string;
}

async function fillAndSubmit({ email, username, password }: Values) {
  const user = userEvent.setup();
  if (email)
    await user.type(screen.getByLabelText("Email"), email);
  if (username)
    await user.type(screen.getByLabelText("Username"), username);
  if (password)
    await user.type(screen.getByLabelText("Password"), password);
  await user.click(screen.getByRole("button", { name: "Create account" }));
}

const VALID = { email: "nova@example.com", username: "nova_42", password: "osDda42x" };

beforeEach(async () => {
  localStorage.clear();
  setAccessToken(null);
  await i18n.changeLanguage("en");
});

describe("Signup", () => {
  it("cadastro certo vai para o ?next", async () => {
    const router = await openSignup("/signup?next=%2Fprivacy");
    await fillAndSubmit(VALID);
    await waitFor(() => expect(router.state.location.pathname).toBe("/privacy"));
  });

  it("manda e-mail e username normalizados, a senha intacta e o idioma da tela", async () => {
    let sent: unknown;
    server.use(
      http.post("/api/auth/signup", async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json(authResponse, { status: 201 });
      }),
    );
    await openSignup();
    await fillAndSubmit({ email: " Nova@Example.com ", username: " Nova_42 ", password: " Ab1 Cdefg" });
    await waitFor(() => expect(sent).toBeDefined());
    expect(sent).toEqual({
      email: "nova@example.com",
      username: "nova_42",
      password: " Ab1 Cdefg",
      preferred_language: "en",
    });
  });

  it("409 email_taken aparece no campo de e-mail, com foco", async () => {
    await openSignup();
    await fillAndSubmit({ ...VALID, email: authResponse.user.email });
    const email = screen.getByLabelText("Email");
    await waitFor(() => expect(email).toHaveAccessibleDescription("This email is already registered."));
    expect(email).toHaveFocus();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("409 username_taken aparece no campo de usuário", async () => {
    server.use(
      http.post("/api/auth/signup", () =>
        HttpResponse.json({ error: { code: "username_taken" } }, { status: 409 }),
      ),
    );
    await openSignup();
    await fillAndSubmit(VALID);
    const username = screen.getByLabelText("Username");
    await waitFor(() => expect(username).toHaveAccessibleDescription("This username is already taken."));
    expect(username).toHaveFocus();
  });

  it("o conflito some quando o campo é editado", async () => {
    await openSignup();
    await fillAndSubmit({ ...VALID, email: authResponse.user.email });
    const email = screen.getByLabelText("Email");
    await waitFor(() => expect(email).toHaveAccessibleDescription());
    await userEvent.setup().type(email, "x");
    expect(email).not.toHaveAccessibleDescription();
  });

  it("422: cada code vai para o seu campo", async () => {
    server.use(
      http.post("/api/auth/signup", () =>
        HttpResponse.json(
          { error: { code: "validation_error", fields: { username: "invalid_format", password: "weak_password" } } },
          { status: 422 },
        ),
      ),
    );
    await openSignup();
    await fillAndSubmit(VALID);
    await waitFor(() =>
      expect(screen.getByLabelText("Username")).toHaveAccessibleDescription("Invalid format."));
    expect(screen.getByLabelText("Password")).toHaveAccessibleDescription(/Weak password/);
    expect(screen.getByLabelText("Username")).toHaveFocus();
  });

  it("429 vira erro geral", async () => {
    server.use(
      http.post("/api/auth/signup", () =>
        HttpResponse.json({ error: { code: "rate_limited" } }, { status: 429 }),
      ),
    );
    await openSignup();
    await fillAndSubmit(VALID);
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many attempts.");
  });

  it("envio vazio: acusa os três campos e foca o primeiro", async () => {
    await openSignup();
    await fillAndSubmit({});
    for (const label of ["Email", "Username", "Password"])
      expect(screen.getByLabelText(label)).toHaveAccessibleDescription("Required.");
    expect(screen.getByLabelText("Email")).toHaveFocus();
  });

  it("senha fraca é acusada no front, e nada é enviado", async () => {
    let called = false;
    server.use(
      http.post("/api/auth/signup", () => {
        called = true;
        return HttpResponse.json(authResponse, { status: 201 });
      }),
    );
    await openSignup();
    await fillAndSubmit({ ...VALID, password: "abcdefgh" });
    expect(screen.getByLabelText("Password")).toHaveAccessibleDescription(/Weak password/);
    expect(called).toBe(false);
  });

  it("falha de rede vira erro geral", async () => {
    server.use(http.post("/api/auth/signup", () => HttpResponse.error()));
    await openSignup();
    await fillAndSubmit(VALID);
    expect(await screen.findByRole("alert")).toHaveTextContent("No connection to the server.");
  });

  it("o link de login leva o ?next junto", async () => {
    await openSignup("/signup?next=%2Fprivacy");
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login?next=%2Fprivacy");
  });
});
