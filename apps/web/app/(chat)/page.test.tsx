import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import HomePage from "./page";

describe("HomePage", () => {
  it("renders the public Gallagher Property Company homepage", () => {
    const { container } = render(<HomePage />);

    expect(screen.getByRole("heading", { name: "Gallagher Property Company" })).toBeInTheDocument();
    expect(screen.getByText("Review the business by section")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /where the company stays narrow on purpose/i })).toHaveAttribute("href", "/focus");
    expect(screen.getByRole("link", { name: /how opportunities move from screen to hold/i })).toHaveAttribute("href", "/strategy");
    expect(screen.getByRole("link", { name: /what the internal system actually does/i })).toHaveAttribute("href", "/platform");
    expect(screen.getByText("Homepage + 3 section pages")).toBeInTheDocument();
    expect(screen.getByText("Housing + infill industrial")).toBeInTheDocument();
    expect(screen.getByText("Basis -> approvals -> operations")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /enter the platform/i })).toHaveAttribute("href", "/login");
    expect(container.firstChild).toMatchSnapshot();
  });
});
