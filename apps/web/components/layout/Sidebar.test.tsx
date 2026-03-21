import type { HTMLAttributes } from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: {
      user: {
        name: "Blake Gallagher",
        email: "blake@gallagherpropco.com",
      },
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
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders the development and investment navigation frame", () => {
    const { container } = render(<Sidebar />);

    expect(screen.getByText("Gallagher Property Company")).toBeInTheDocument();
    expect(screen.getByText("Development and investment OS")).toBeInTheDocument();
    expect(screen.getByText("Execution")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Chat/i })).toBeInTheDocument();
    expect(container.firstChild).toMatchSnapshot();
  });
});
