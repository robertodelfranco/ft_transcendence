import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { beforeEach, describe, expect, it } from "vitest";
import i18n from "./i18n";
import { routes } from "./routes";

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return render(<RouterProvider router={router} />);
}

beforeEach(async () => {
  localStorage.clear();
  await i18n.changeLanguage("en");
});

describe("casca", () => {
  it("trocar o idioma muda o texto, o <html lang> e o localStorage", async () => {
    const user = userEvent.setup();
    renderAt("/");
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Language"), "es");

    expect(screen.getByRole("link", { name: "Política de Privacidad" })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("es");
    expect(localStorage.getItem("lang")).toBe("es");
  });

  it("o título do documento acompanha a página e o idioma", async () => {
    const user = userEvent.setup();
    renderAt("/privacy");
    expect(document.title).toBe("Privacy Policy · Catacombs 42");

    await user.selectOptions(screen.getByLabelText("Language"), "pt-BR");

    expect(document.title).toBe("Política de Privacidade · Catacombs 42");
  });

  it.each(["/", "/privacy", "/terms", "/nao-existe"])(
    "%s tem seletor de idioma e links legais",
    (path) => {
      renderAt(path);
      expect(screen.getByLabelText("Language")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Privacy Policy" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Terms of Service" })).toBeInTheDocument();
    },
  );

  it("rota desconhecida mostra a página 404", () => {
    renderAt("/nao-existe");
    expect(screen.getByRole("heading", { name: "Page not found" })).toBeInTheDocument();
  });
});