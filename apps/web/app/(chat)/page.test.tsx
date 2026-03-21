import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import HomePage from "./page";

describe("HomePage", () => {
  it("renders the public Gallagher Property Company homepage", () => {
    const { container } = render(<HomePage />);

    expect(screen.getByText("Gallagher Property Company")).toBeInTheDocument();
    expect(screen.getByText("BUY")).toBeInTheDocument();
    expect(screen.getByText("BUILD")).toBeInTheDocument();
    expect(screen.getByText("MANAGE")).toBeInTheDocument();
    expect(screen.getByText("What we buy")).toBeInTheDocument();
    expect(screen.getByText("What we build")).toBeInTheDocument();
    expect(screen.getByText("What we manage")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /enter entitlement os/i })).toHaveAttribute("href", "/login");
    expect(container.firstChild).toMatchSnapshot();
  });
});
