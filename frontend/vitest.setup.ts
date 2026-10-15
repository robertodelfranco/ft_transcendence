import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";
import { resetMockSession } from "./src/mocks/handlers";
import { server } from "./src/mocks/server";

// "error": requisição sem handler derruba o teste, em vez de sair para a rede de verdade
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));

afterEach(() => {
  // Sem `globals: true`, o Testing Library não registra a limpeza sozinho
  cleanup();
  // Um teste que mexeu nos handlers (server.use) não vaza para o seguinte
  server.resetHandlers();
  // O "cookie" do mock volta a deslogado
  resetMockSession();
});

afterAll(() => server.close());
