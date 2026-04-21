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
      screen.getByText("Manufactured Housing + Infill Industrial"),
    ).toBeInTheDocument();
    expect(screen.getByText("Buy → Build → Manage")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Focus" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Review the company by section" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /enter the platform/i })).toHaveAttribute(
      "href",
      "/login",
    );
  });
});
