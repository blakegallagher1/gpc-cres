import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import HomePage from "./page";

describe("HomePage", () => {
  it("renders the public Gallagher Property Company homepage", () => {
    render(<HomePage />);

    expect(
      screen.getByRole("link", { name: "Gallagher Property Company" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Review the company by section" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /investment focus/i }),
    ).toHaveAttribute("href", "/focus");
    expect(
      screen.getByRole("link", { name: /execution strategy/i }),
    ).toHaveAttribute("href", "/strategy");
    expect(
      screen.getByRole("link", { name: /operating platform/i }),
    ).toHaveAttribute("href", "/platform");
    expect(
      screen.getByText("Manufactured Housing + Infill Industrial"),
    ).toBeInTheDocument();
    expect(screen.getByText("Buy → Build → Manage")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /enter the platform/i })).toHaveAttribute("href", "/login");
  });
});
