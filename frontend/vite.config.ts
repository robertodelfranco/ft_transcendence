import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // host: true deixa o dev server acessível pelo Windows quando rodando no WSL
  server: { host: true },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    // Dois projetos para o jogo falso (vitest.shell.setup.ts) valer só na casca: game/** testa o
    // index de verdade. O extends herda environment e setupFiles daqui
    projects: [
      {
        extends: true,
        test: {
          name: "shell",
          include: ["src/**/*.test.{ts,tsx}"],
          setupFiles: ["./vitest.shell.setup.ts"],
        },
      },
      { extends: true, test: { name: "game", include: ["game/**/*.test.ts"] } },
    ],
  },
});
