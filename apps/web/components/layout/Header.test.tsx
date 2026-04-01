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
const { pathnameMock } = vi.hoisted(() => ({
  pathnameMock: { value: "/map" as string },
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
  usePathname: () => pathnameMock.value,
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
    pathnameMock.value = "/map";
    vi.clearAllMocks();
  });

  it("renders route-aware operating-system chrome", () => {
    const { container } = render(<Header />);

    expect(screen.getByText("Gallagher Property Company")).toBeInTheDocument();
    expect(screen.getByText("Map")).toBeInTheDocument();
    expect(
      screen.getByText("Spatial intelligence, prospecting, and parcel analysis"),
    ).toBeInTheDocument();
    expect(screen.getByText("Ctrl")).toBeInTheDocument();
    expect(container.firstChild).toMatchSnapshot();
  });

  it("opens command search when shell is clicked", () => {
    render(<Header />);

    fireEvent.click(screen.getByRole("button", { name: "Open desktop command search" }));
    expect(openCommandPaletteMock).toHaveBeenCalledTimes(1);
  });

  it("collapses top chrome density on /chat", () => {
    pathnameMock.value = "/chat";
    render(<Header />);

    expect(screen.getByText("Chat")).toBeInTheDocument();
    expect(
      screen.queryByText("Spatial intelligence, prospecting, and parcel analysis"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Open desktop command search" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start a new run" })).toBeInTheDocument();
  });
});
