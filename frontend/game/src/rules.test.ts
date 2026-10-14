import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import * as rules from "./rules";

const mirror = JSON.parse(
  readFileSync(new URL("../fixtures/mirror.json", import.meta.url), "utf8"),
);

test("rules.ts has the same names and values as rules.py", () => {
  // toEqual nos dois sentidos: constante a mais no TS também falha
  expect({ ...rules }).toEqual(mirror.rules);
});
