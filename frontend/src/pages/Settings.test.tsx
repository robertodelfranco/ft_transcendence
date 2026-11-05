import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../api/client";
import { setAccessToken } from "../auth/token";
import i18n from "../i18n";
import authResponse from "../mocks/fixtures/authResponse.json";
import { MOCK_PASSWORD } from "../mocks/handlers";
import { MAX_AVATAR_BYTES } from "../profile/avatarFile";
import { server } from "../mocks/server";
import { routes } from "../routes";

// Sessão do mock (augusto, pt-BR), como ao recarregar a página
async function renderSettings() {
  await apiFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "a@b.c", password: MOCK_PASSWORD }),
  });
  setAccessToken(null);
  const router = createMemoryRouter(routes, { initialEntries: ["/settings"] });
  render(<RouterProvider router={router} />);
  return await screen.findByLabelText("Nome de usuário");
}

// O que cada PATCH levou no corpo. O handler não responde: o MSW passa para o do mock
let patches: unknown[];

beforeEach(async () => {
  localStorage.clear();
  setAccessToken(null);
  await i18n.changeLanguage("en");
  patches = [];
  server.use(http.patch("/api/users/me", async ({ request }) => {
    patches.push(await request.clone().json());
  }));
});

describe("/settings", () => {
  it("troca o username: manda normalizado e o cabeçalho acompanha", async () => {
    const user = userEvent.setup();
    const field = await renderSettings();
    expect(field).toHaveValue("augusto");

    await user.clear(field);
    await user.type(field, " Augusto_42 ");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("Alterações salvas.")).toBeInTheDocument();
    expect(patches).toEqual([{ username: "augusto_42" }]);
    const nav = screen.getByRole("navigation", { name: "Sua conta" });
    expect(within(nav).getByRole("link", { name: "augusto_42" })).toBeInTheDocument();
  });

  it("username inválido nem sai: o erro aparece no campo", async () => {
    const user = userEvent.setup();
    const field = await renderSettings();
    await user.clear(field);
    await user.type(field, "ab");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("Muito curto.")).toBeInTheDocument();
    expect(field).toHaveFocus();
    expect(patches).toEqual([]);
  });

  it("username em uso: o 409 aparece no campo", async () => {
    server.use(http.patch("/api/users/me", () => HttpResponse.json(
      { error: { code: "username_taken", message: "username taken", request_id: "r1", fields: null } },
      { status: 409 },
    )));
    const user = userEvent.setup();
    const field = await renderSettings();
    await user.clear(field);
    await user.type(field, "roberto");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("Este nome de usuário já está em uso.")).toBeInTheDocument();
    expect(field).toHaveAttribute("aria-invalid", "true");
  });

  it("o mesmo nome não manda nada", async () => {
    const user = userEvent.setup();
    await renderSettings();
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByText("Alterações salvas.")).toBeInTheDocument();
    expect(patches).toEqual([]);
  });

  it("falha de rede vira aviso traduzido", async () => {
    server.use(http.patch("/api/users/me", () => HttpResponse.error()));
    const user = userEvent.setup();
    const field = await renderSettings();
    await user.clear(field);
    await user.type(field, "outro_nome");
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Sem conexão com o servidor");
  });

  it("tem o seletor de idioma, que grava no perfil", async () => {
    const user = userEvent.setup();
    await renderSettings();
    const main = screen.getByRole("main");
    await user.selectOptions(within(main).getByLabelText("Idioma"), "es");
    expect(await within(main).findByLabelText("Nombre de usuario")).toBeInTheDocument();
    expect(patches).toEqual([{ preferred_language: "es" }]);
  });
});

describe("/settings: avatar", () => {
  const png = (size = 10) => new File([new Uint8Array(size)], "foto.png", { type: "image/png" });
  let uploaded: string[]; // o nome do arquivo de cada PUT
  let refuse: Response | null; // resposta de erro para o próximo PUT

  beforeEach(() => {
    uploaded = [];
    refuse = null;
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:previa");
    vi.spyOn(URL, "revokeObjectURL").mockReturnValue(undefined);
    // O fetch do Node não manda um File do jsdom dentro de FormData (o undici acusa
    // UND_ERR_REQ_CONTENT_LENGTH_MISMATCH), então o PUT do avatar é respondido aqui, antes do MSW.
    // No navegador fetch, FormData e File são do mesmo lugar, e o handler do mock responde
    const mswFetch = globalThis.fetch;
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      if (init?.method !== "PUT" || !String(input).endsWith("/api/users/me/avatar"))
        return mswFetch(input, init);
      uploaded.push(((init.body as FormData).get("file") as File).name);
      return Promise.resolve(refuse ?? Response.json(
        { ...authResponse.user, avatar_url: `/media/avatars/7-mock${uploaded.length}.png` }));
    });
  });

  afterEach(() => vi.restoreAllMocks());

  const avatarImage = () => screen.getByRole("main").querySelector("img");

  it("escolher mostra a prévia; enviar troca o avatar e libera a prévia", async () => {
    const user = userEvent.setup();
    await renderSettings();
    await user.upload(screen.getByLabelText("Escolher imagem"), png());

    expect(screen.getByRole("img", { name: "Prévia do novo avatar" })).toHaveAttribute("src", "blob:previa");
    await user.click(screen.getByRole("button", { name: "Enviar avatar" }));

    expect(await screen.findByText("Avatar atualizado.")).toBeInTheDocument();
    expect(uploaded).toEqual(["foto.png"]);
    expect(avatarImage()).toHaveAttribute("src", "/media/avatars/7-mock1.png");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:previa");
  });

  it("tipo fora da lista nem vira prévia", async () => {
    // applyAccept: false deixa o teste escolher o que o seletor do navegador esconderia
    const user = userEvent.setup({ applyAccept: false });
    await renderSettings();
    await user.upload(screen.getByLabelText("Escolher imagem"),
      new File(["GIF89a"], "anim.gif", { type: "image/gif" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Envie uma imagem PNG, JPEG ou WebP válida.");
    expect(screen.queryByRole("img", { name: "Prévia do novo avatar" })).not.toBeInTheDocument();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("acima de 2 MB nem vira prévia", async () => {
    const user = userEvent.setup();
    await renderSettings();
    await user.upload(screen.getByLabelText("Escolher imagem"), png(MAX_AVATAR_BYTES + 1));
    expect(screen.getByRole("alert")).toHaveTextContent("A imagem passa de 2 MB.");
    expect(screen.queryByRole("button", { name: "Enviar avatar" })).not.toBeInTheDocument();
  });

  it("cancelar volta ao avatar atual e libera a prévia, sem enviar", async () => {
    const user = userEvent.setup();
    await renderSettings();
    await user.upload(screen.getByLabelText("Escolher imagem"), png());
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(avatarImage()).toHaveAttribute("src", "/media/avatars/default.png");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:previa");
    expect(uploaded).toEqual([]);
  });

  it("recusa do servidor mostra o erro e mantém a prévia para tentar de novo", async () => {
    refuse = Response.json(
      { error: { code: "avatar_invalid", message: "not an image", request_id: "r2", fields: null } },
      { status: 422 },
    );
    const user = userEvent.setup();
    await renderSettings();
    await user.upload(screen.getByLabelText("Escolher imagem"), png());
    await user.click(screen.getByRole("button", { name: "Enviar avatar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Envie uma imagem PNG, JPEG ou WebP válida.");
    expect(screen.getByRole("img", { name: "Prévia do novo avatar" })).toBeInTheDocument();
  });

  it("remover só aparece com avatar enviado, e volta ao padrão", async () => {
    const user = userEvent.setup();
    await renderSettings();
    expect(screen.queryByRole("button", { name: "Remover avatar" })).not.toBeInTheDocument();

    await user.upload(screen.getByLabelText("Escolher imagem"), png());
    await user.click(screen.getByRole("button", { name: "Enviar avatar" }));
    await user.click(await screen.findByRole("button", { name: "Remover avatar" }));

    await waitFor(() => expect(avatarImage()).toHaveAttribute("src", "/media/avatars/default.png"));
    expect(screen.queryByRole("button", { name: "Remover avatar" })).not.toBeInTheDocument();
  });
});
