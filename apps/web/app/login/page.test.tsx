/* eslint-disable @next/next/no-img-element -- test double for next/image uses a plain img in Vitest. */
import type { ImgHTMLAttributes } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { signInMock } = vi.hoisted(() => ({
  signInMock: vi.fn(),
}));

vi.mock("next-auth/react", () => ({
  signIn: signInMock,
}));

vi.mock("next/image", () => ({
  default: ({ alt, src, ...props }: ImgHTMLAttributes<HTMLImageElement>) => (
    <img alt={alt} src={typeof src === "string" ? src : ""} {...props} />
  ),
}));

import LoginPage from "./page";

describe("LoginPage", () => {
  beforeEach(() => {
    signInMock.mockReset();
    vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {});
  });

  it("renders the branded landing layout for login", () => {
    const { container } = render(<LoginPage />);

    expect(screen.getByRole("heading", { name: "Entitlement OS" })).toBeInTheDocument();
    expect(screen.getByText("Three live layers before the first call.")).toBeInTheDocument();
    expect(screen.getByText("From parcel scan to active deal room.")).toBeInTheDocument();
    expect(screen.getByText("Enter the operating system.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Continue with Google" }).length).toBeGreaterThan(0);
    expect(container.firstChild).toMatchSnapshot();
  });

  it("reveals credential access when password sign-in is requested", async () => {
    const user = userEvent.setup();

    render(<LoginPage />);

    await user.click(screen.getAllByRole("button", { name: "Use company credentials" })[0]);

    expect(await screen.findByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
  });
});
