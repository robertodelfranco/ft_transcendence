import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { beforeEach, describe, expect, it } from "vitest";
import i18n from "../i18n";
import { routes } from "../routes";

async function openAt(path: string, heading: string) {
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />);
  await screen.findByRole("heading", { name: heading });
}

beforeEach(async () => {
  localStorage.clear();
  await i18n.changeLanguage("en");
});

describe("OAuthButtons", () => {
  it.each([
    ["/login", "Sign in"],
    ["/signup", "Create an account"],
  ])("%s mostra os dois links, apontando para o backend", async (path, heading) => {
    await openAt(path, heading);
    expect(screen.getByRole("link", { name: "Sign in with 42" }))
      .toHaveAttribute("href", "/api/auth/oauth/42/login?lang=en");
    expect(screen.getByRole("link", { name: "Sign in with Google" }))
      .toHaveAttribute("href", "/api/auth/oauth/google/login?lang=en");
  });

  it("o ?lang acompanha o idioma da tela, inclusive depois de trocar", async () => {
    await openAt("/login", "Sign in");
    await userEvent.setup().selectOptions(screen.getByLabelText("Language"), "pt-BR");
    expect(screen.getByRole("link", { name: "Entrar com a 42" }))
      .toHaveAttribute("href", "/api/auth/oauth/42/login?lang=pt-BR");
    expect(screen.getByRole("link", { name: "Entrar com Google" }))
      .toHaveAttribute("href", "/api/auth/oauth/google/login?lang=pt-BR");
  });
});
