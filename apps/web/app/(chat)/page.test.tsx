/* eslint-disable @next/next/no-img-element -- test double for next/image uses a plain img in Vitest. */
import type { ImgHTMLAttributes } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({
  default: ({ alt, src, ...props }: ImgHTMLAttributes<HTMLImageElement>) => (
    <img alt={alt} src={typeof src === "string" ? src : ""} {...props} />
  ),
}));

import HomePage from "./page";

describe("HomePage", () => {
  it("renders the public Gallagher Property Company homepage", () => {
    const { container } = render(<HomePage />);

    expect(
      screen.getByRole("heading", { name: "Gallagher Property Company" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Development, investment, and deal control."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("From site context to capital commitment."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Operator access" })).toHaveAttribute("href", "/login");
    expect(container.firstChild).toMatchSnapshot();
  });
});
