import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import HomePage from "./page";

describe("HomePage", () => {
  it("renders the public Gallagher Property Company homepage", () => {
    const { container } = render(<HomePage />);

    expect(
      screen.getByRole("heading", { name: "Gallagher Property Company" }),
    ).toBeInTheDocument();
    expect(screen.getByText("See the site before the story gets expensive.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Buy" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Build" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Manage" })).toBeInTheDocument();
    expect(screen.getAllByText("Basis before story").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Approvals before spend").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Operations before optics").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /enter the live workspace/i })).toHaveAttribute("href", "/login");
    expect(container.firstChild).toMatchSnapshot();
  });
});
