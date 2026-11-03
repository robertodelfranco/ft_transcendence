import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { beforeEach, describe, expect, it } from "vitest";
import i18n from "../i18n";
import { routes } from "../routes";

beforeEach(async () => {
  localStorage.clear();
  await i18n.changeLanguage("en");
});

describe("Home", () => {
  it.each([
    ["Sign in", "Sign in"],
    ["Create account", "Create an account"],
  ])("o link \"%s\" leva à tela de entrada", async (link, heading) => {
    render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ["/"] })} />);
    await userEvent.setup().click(await screen.findByRole("link", { name: link }));
    expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
  });
});
