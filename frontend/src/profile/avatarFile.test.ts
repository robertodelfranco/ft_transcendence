import { describe, expect, it } from "vitest";
import { MAX_AVATAR_BYTES, checkAvatarFile } from "./avatarFile";

function file(type: string, size: number): File {
  return new File([new Uint8Array(size)], "foto", { type });
}

describe("checkAvatarFile", () => {
  it.each(["image/png", "image/jpeg", "image/webp"])("aceita %s de até 2 MiB", (type) => {
    expect(checkAvatarFile(file(type, MAX_AVATAR_BYTES))).toBeNull();
  });

  it.each(["image/gif", "image/svg+xml", "text/html", ""])("recusa o tipo %j", (type) => {
    expect(checkAvatarFile(file(type, 10))).toBe("avatar_invalid");
  });

  it("acima de 2 MiB é avatar_too_large, mesmo com o tipo errado, como no backend", () => {
    expect(checkAvatarFile(file("image/gif", MAX_AVATAR_BYTES + 1))).toBe("avatar_too_large");
  });
});
