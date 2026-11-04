import { describe, expect, it } from "vitest";
import { legalText } from "./legal";

describe("legalText", () => {
  it("escolhe o arquivo do idioma", () => {
    expect(legalText("privacy", "es")).not.toBe(legalText("privacy", "en"));
  });

  it.each(["fr", undefined])("idioma sem arquivo (%s) cai no en", (language) => {
    expect(legalText("terms", language)).toBe(legalText("terms", "en"));
  });
});
