import type { HTMLAttributes } from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { toggleSidebarMock } = vi.hoisted(() => ({
  toggleSidebarMock: vi.fn(),
}));

vi.mock("framer-motion", () => ({
  motion: {
    span: ({ children, ...props }: HTMLAttributes<HTMLSpanElement>) => (
      <span {...props}>{children}</span>
    ),
  },
  useReducedMotion: () => true,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/chat",
}));

vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({
    isLoaded: true,
    user: {
      fullName: "Blake Gallagher",
      primaryEmailAddress: { emailAddress: "blake@gallagherpropco.com" },
    },
  }),
}));

vi.mock("@/stores/uiStore", () => ({
  useUIStore: () => ({
    sidebarCollapsed: false,
    toggleSidebar: toggleSidebarMock,
  }),
}));

vi.mock("@/hooks/useIsMobile", () => ({
  useIsMobile: () => false,
}));

import { Sidebar } from "@/components/layout/Sidebar";

describe("Sidebar", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-21T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("renders the development and investment navigation frame", () => {
    const { container } = render(<Sidebar />);

    expect(screen.getByText("Gallagher Property Company")).toBeInTheDocument();
    expect(screen.getByText("Development and investment OS")).toBeInTheDocument();
    expect(screen.getAllByText("Operate").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Intelligence").length).toBeGreaterThan(0);
    expect(screen.getAllByText("System").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /Chat/i })).toBeInTheDocument();
    expect(container.firstChild).toMatchSnapshot();
  });
});
