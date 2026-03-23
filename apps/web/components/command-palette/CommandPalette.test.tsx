// @vitest-environment jsdom
import type {
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
} from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  pushMock,
  setThemeMock,
  toggleCopilotMock,
  setCommandPaletteOpenMock,
  fetchMock,
} = vi.hoisted(() => ({
  pushMock: vi.fn(),
  setThemeMock: vi.fn(),
  toggleCopilotMock: vi.fn(),
  setCommandPaletteOpenMock: vi.fn(),
  fetchMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "dark", setTheme: setThemeMock }),
}));

vi.mock("../../lib/hooks/useAgents", () => ({
  useAgents: () => ({ agents: [] }),
}));

vi.mock("../../stores/uiStore", () => ({
  useUIStore: () => ({
    commandPaletteOpen: true,
    setCommandPaletteOpen: setCommandPaletteOpenMock,
    toggleCopilot: toggleCopilotMock,
  }),
}));

vi.mock("../ui/button", () => ({
  Button: ({
    children,
    ...props
  }: HTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
}));

vi.mock("../ui/command", () => ({
  CommandDialog: ({
    children,
    open,
  }: {
    children: ReactNode;
    open: boolean;
  }) => (open ? <div>{children}</div> : null),
  CommandInput: ({
    value,
    onValueChange,
    ...props
  }: InputHTMLAttributes<HTMLInputElement> & {
    onValueChange?: (value: string) => void;
  }) => (
    <input
      value={value}
      onChange={(event) => onValueChange?.(event.target.value)}
      {...props}
    />
  ),
  CommandList: ({ children }: HTMLAttributes<HTMLDivElement>) => <div>{children}</div>,
  CommandEmpty: ({ children }: HTMLAttributes<HTMLDivElement>) => <div>{children}</div>,
  CommandGroup: ({
    children,
    heading,
  }: HTMLAttributes<HTMLDivElement> & { heading?: string }) => (
    <section>
      {heading ? <h2>{heading}</h2> : null}
      {children}
    </section>
  ),
  CommandItem: ({
    children,
    onSelect,
  }: HTMLAttributes<HTMLButtonElement> & { onSelect?: () => void }) => (
    <button type="button" onClick={onSelect}>
      {children}
    </button>
  ),
  CommandSeparator: () => <hr />,
}));

import { CommandPalette } from "./CommandPalette";

describe("CommandPalette", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders grouped content results from /api/search", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        query: "oak",
        limit: 5,
        groups: {
          deals: [
            {
              id: "deal-1",
              title: "Oak Assembly",
              href: "/deals/deal-1",
              subtitle: "SITE_CONTROL · Baton Rouge",
            },
          ],
          parcels: [
            {
              id: "parcel-1",
              title: "123 Oak St",
              href: "/deals/deal-1",
              subtitle: "123-456 · C-2",
            },
          ],
          knowledge: [
            {
              id: "knowledge-1",
              title: "Oak memo",
              href: "/admin?tab=knowledge&search=memo-1",
              subtitle: "deal_memo · memo-1",
            },
          ],
          runs: [],
          conversations: [],
        },
        errors: {},
      }),
    });

    const user = userEvent.setup();
    render(<CommandPalette />);

    await user.type(
      screen.getByPlaceholderText(
        "Search deals, parcels, runs, knowledge, conversations, or commands...",
      ),
      "oak",
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/search?q=oak&limit=5",
        expect.any(Object),
      );
    });

    expect(await screen.findByText("Deals")).toBeInTheDocument();
    expect(screen.getByText("Oak Assembly")).toBeInTheDocument();
    expect(screen.getByText("Parcels")).toBeInTheDocument();
    expect(screen.getByText("123 Oak St")).toBeInTheDocument();
    expect(screen.getByText("Knowledge")).toBeInTheDocument();
    expect(screen.getByText("Oak memo")).toBeInTheDocument();
  });

  it("keeps command results available during content search", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        query: "settings",
        limit: 5,
        groups: {
          deals: [],
          parcels: [],
          knowledge: [],
          runs: [],
          conversations: [],
        },
        errors: {},
      }),
    });

    const user = userEvent.setup();
    render(<CommandPalette />);

    await user.type(
      screen.getAllByPlaceholderText(
        "Search deals, parcels, runs, knowledge, conversations, or commands...",
      )[0],
      "settings",
    );

    expect(await screen.findByText("Commands")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Go to Settings/i }));

    expect(pushMock).toHaveBeenCalledWith("/settings");
    expect(setCommandPaletteOpenMock).toHaveBeenCalledWith(false);
  });
});
