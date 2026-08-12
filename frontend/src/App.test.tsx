import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "./App";

describe("App", () => {
  it("renders the app title", () => {
    render(<App />);
    expect(
      screen.getByRole("heading", { name: "AI 홈트레이닝 코치" }),
    ).toBeInTheDocument();
  });
});
