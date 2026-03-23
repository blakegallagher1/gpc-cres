// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "authenticated" }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  usePathname: () => "/settings",
}));

vi.mock("@/components/layout/DashboardShell", () => ({
  DashboardShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/preferences/UserPreferencesPanel", () => ({
  UserPreferencesPanel: () => <div>Workspace preferences</div>,
}));

import SettingsPage from "./page";

describe("SettingsPage", () => {
  it("renders a real settings surface instead of a dead route", () => {
    const { container } = render(<SettingsPage />);

    expect(
      screen.getByRole("heading", { name: "Operator settings" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Workspace preferences")).toBeInTheDocument();
    expect(screen.getByText("Copilot and Codex")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open Codex workspace/i })).toHaveAttribute(
      "href",
      "/admin/codex",
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
