import { expect, test } from "vitest";
import mirror from "../fixtures/mirror.json";
import * as rules from "./rules";

test("rules.ts has the same names and values as rules.py", () => {
  // toEqual nos dois sentidos: constante a mais no TS também falha
  expect({ ...rules }).toEqual(mirror.rules);
});
