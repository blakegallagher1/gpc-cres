import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import HomePage from "./page";

describe("HomePage", () => {
  it("renders the public Gallagher Property Company homepage", () => {
    const { container } = render(<HomePage />);

    expect(
      screen.getByRole("heading", { name: "Gallagher Property Company" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Buy" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Build" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Manage" })).toBeInTheDocument();
    expect(screen.getByText("Acquire with basis discipline")).toBeInTheDocument();
    expect(screen.getByText("Execute against the parcel")).toBeInTheDocument();
    expect(screen.getByText("Operate for durable performance")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /enter entitlement os/i })).toHaveAttribute("href", "/login");
    expect(container.firstChild).toMatchSnapshot();
  });
});
