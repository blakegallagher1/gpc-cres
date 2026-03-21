import type { HTMLAttributes } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { openCommandPaletteMock, toggleCopilotMock, pushMock, setThemeMock } =
  vi.hoisted(() => ({
    openCommandPaletteMock: vi.fn(),
    toggleCopilotMock: vi.fn(),
    pushMock: vi.fn(),
    setThemeMock: vi.fn(),
  }));

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
  },
  useReducedMotion: () => true,
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "dark", setTheme: setThemeMock }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => "/map",
}));

vi.mock("next-auth/react", () => ({
  signOut: vi.fn(),
}));

vi.mock("@/stores/uiStore", () => ({
  useUIStore: () => ({
    sidebarCollapsed: false,
    openCommandPalette: openCommandPaletteMock,
    toggleCopilot: toggleCopilotMock,
  }),
}));

vi.mock("@/hooks/useIsMobile", () => ({
  useIsMobile: () => false,
}));

vi.mock("@/components/notifications/NotificationFeed", () => ({
  NotificationFeed: () => <div data-testid="notification-feed" />,
}));

import { Header } from "@/components/layout/Header";

describe("Header", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders route-aware operating-system chrome", () => {
    const { container } = render(<Header />);

    expect(screen.getByText("Gallagher Property Company")).toBeInTheDocument();
    expect(screen.getByText("Parcel intelligence map")).toBeInTheDocument();
    expect(
      screen.getByText("Search parcels, draw geofences, and move site context into active workflows."),
    ).toBeInTheDocument();
    expect(screen.getByText("Ctrl")).toBeInTheDocument();
    expect(container.firstChild).toMatchSnapshot();
  });

  it("opens command search when shell is clicked", () => {
    render(<Header />);

    fireEvent.click(screen.getByRole("button", { name: "Open desktop command search" }));
    expect(openCommandPaletteMock).toHaveBeenCalledTimes(1);
  });
});
