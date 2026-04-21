import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs", () => ({
  SignIn: () => <div data-testid="clerk-sign-in" />,
  ClerkProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/login",
}));

import LoginPage from "./[[...sign-in]]/page";

describe("LoginPage", () => {
  it("renders sign-in as the primary surface on the public shell", () => {
    render(<LoginPage />);

    expect(screen.getByRole("heading", { name: "Sign in to Entitlement OS" })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Gallagher Property Company" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("clerk-sign-in")).toBeInTheDocument();
  });
});
