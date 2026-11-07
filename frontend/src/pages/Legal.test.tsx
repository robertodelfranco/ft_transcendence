import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { beforeEach, describe, expect, it } from "vitest";
import { setAccessToken } from "../auth/token";
import i18n from "../i18n";
import { legalText } from "../i18n/legal";
import type { LegalPage } from "../i18n/legalPages";
import { routes } from "../routes";

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

// o primeiro ## do arquivo: prova que o Markdown virou h2 sem amarrar o teste ao texto
function firstSection(page: LegalPage, language: string) {
  return legalText(page, language).match(/^## (.+)$/m)![1];
}

beforeEach(async () => {
  localStorage.clear();
  setAccessToken(null);
  await i18n.changeLanguage("en");
});

describe("páginas legais", () => {
  it.each<[LegalPage, string]>([
    ["privacy", "Privacy Policy"],
    ["terms", "Terms of Service"],
  ])("/%s abre sem login, com o título do rodapé e o Markdown do idioma", async (page, title) => {
    renderAt(`/${page}`);
    expect(await screen.findByRole("heading", { level: 1, name: title })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: firstSection(page, "en") })).toBeInTheDocument();
    // o título é posto num efeito, que roda um instante depois de o h1 aparecer
    await waitFor(() => expect(document.title).toBe(`${title} · Catacombs 42`));
  });

  it("troca o texto junto com o idioma", async () => {
    renderAt("/privacy");
    await screen.findByRole("heading", { level: 1, name: "Privacy Policy" });

    await act(() => i18n.changeLanguage("es"));
    expect(screen.getByRole("heading", { level: 1, name: "Política de Privacidad" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: firstSection("privacy", "es") })).toBeInTheDocument();
  });

  it("o link para a Privacy Policy dentro dos Terms troca de página pelo router", async () => {
    const user = userEvent.setup();
    const router = renderAt("/terms");
    const article = await screen.findByRole("article");

    await user.click(within(article).getByRole("link", { name: "Privacy Policy" }));
    expect(router.state.location.pathname).toBe("/privacy");
    expect(await screen.findByRole("heading", { level: 1, name: "Privacy Policy" })).toBeInTheDocument();
  });
});
