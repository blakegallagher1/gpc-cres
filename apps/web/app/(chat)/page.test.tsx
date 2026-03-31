import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import HomePage from "./page";

describe("HomePage", () => {
  it("renders the public Gallagher Property Company homepage", () => {
    const { container } = render(<HomePage />);

    expect(
      screen.getByRole("heading", { name: "Institutional discipline for functional real estate." }),
    ).toBeInTheDocument();
    expect(screen.getByText("Communities and flex industrial, under one discipline.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Buy" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Build" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Manage" })).toBeInTheDocument();
    expect(screen.getAllByText("Basis before story").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Approvals before spend").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Operations before optics").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "A real working environment for real estate execution." })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /enter the live workspace/i })[0]).toHaveAttribute("href", "/login");
    expect(container.firstChild).toMatchSnapshot();
  });
});
