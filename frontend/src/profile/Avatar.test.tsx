import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Avatar from "./Avatar";

const roberto = { username: "roberto", avatar_url: "/media/avatars/3-1a2b3c4d.png" };

describe("Avatar", () => {
  it("mostra a imagem como decoração, sem texto alternativo repetindo o nome", () => {
    const { container } = render(<Avatar user={roberto} large />);
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", roberto.avatar_url);
    expect(img).toHaveAttribute("alt", "");
  });

  it("imagem que não carrega vira a inicial, e um avatar novo tenta de novo", () => {
    const { container, rerender } = render(<Avatar user={roberto} />);
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("R")).toBeInTheDocument();

    rerender(<Avatar user={{ ...roberto, avatar_url: "/media/avatars/3-9f8e7d6c.png" }} />);
    expect(container.querySelector("img")).toHaveAttribute("src", "/media/avatars/3-9f8e7d6c.png");
  });
});
