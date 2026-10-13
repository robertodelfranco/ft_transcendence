import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import i18next from "eslint-plugin-i18next";
import { importX } from "eslint-plugin-import-x";
import { createTypeScriptImportResolver } from "eslint-import-resolver-typescript";

export default tseslint.config(
  { ignores: ["dist", "node_modules"] },

  js.configs.recommended,
  tseslint.configs.recommended,

  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },

  // Casca: nenhum texto visível fora do i18n e nenhum console (i18n.md §2.5)
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/**/*.test.{ts,tsx}"],
    plugins: { i18next },
    rules: {
      "no-console": "error",
      "i18next/no-literal-string": [
        "error",
        {
          mode: "jsx-only",
          "jsx-attributes": {
            exclude: [
              "className", "style", "type", "key", "id", "width", "height",
              "href", "to", "rel", "target", "htmlFor", "name", "role", "lang",
              "value", "src", "autoComplete", "inputMode",
            ],
          },
        },
      ],
    },
  },

  // ADR 003: o jogo não conhece a casca
  {
    files: ["game/**/*.ts"],
    plugins: { "import-x": importX },
    settings: {
      "import-x/resolver-next": [createTypeScriptImportResolver()],
    },
    rules: {
      "import-x/no-restricted-paths": [
        "error",
        {
          zones: [
            {
              target: "./game",
              from: "./src",
              message: "frontend/game/ não importa frontend/src/ (ADR 003).",
            },
          ],
        },
      ],
    },
  },
);
