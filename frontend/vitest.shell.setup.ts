import { afterEach, vi } from "vitest";
import { resetGameMock } from "./src/mocks/game";

// Só nos testes da casca: o jogo de verdade precisa de WebGL, que o jsdom não tem, e o /ws/game
// não tem mock. Toda tela que chega na /play usa o falso; os testes de game/** usam o de verdade
vi.mock("./game/src/index", () => import("./src/mocks/game"));

afterEach(() => resetGameMock());
