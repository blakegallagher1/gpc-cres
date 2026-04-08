import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { signInMock } = vi.hoisted(() => ({
  signInMock: vi.fn(),
}));

vi.mock("next-auth/react", () => ({
  signIn: signInMock,
}));

import LoginPage from "./page";

describe("LoginPage", () => {
  beforeEach(() => {
    signInMock.mockReset();
  });

  it("renders sign-in as the primary surface on the public shell", () => {
    render(<LoginPage />);

    expect(screen.getByRole("heading", { name: "Sign in to Entitlement OS" })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Gallagher Property Company" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Use company credentials" }),
    ).toBeInTheDocument();
  });

  it("reveals credential access when password sign-in is requested", async () => {
    const user = userEvent.setup();

    render(<LoginPage />);

    await user.click(screen.getByRole("button", { name: "Use company credentials" }));

    expect(await screen.findByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
  });
});
