import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("App", () => {
  it("renderiza a região principal", () => {
    render(<App />);
    expect(screen.getByRole("main")).toBeInTheDocument();
  });
});
