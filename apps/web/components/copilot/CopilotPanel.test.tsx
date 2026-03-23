import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CopilotPanel } from "./CopilotPanel";

const NAVIGATION_MOCK = { pathname: "/deals", searchParams: new URLSearchParams() };

vi.mock("next/navigation", () => ({
  usePathname: () => NAVIGATION_MOCK.pathname,
  useSearchParams: () => NAVIGATION_MOCK.searchParams,
}));

vi.mock("@/lib/agentStream", () => ({
  streamAgentRun: vi.fn(),
}));

vi.mock("@/hooks/useIsMobile", () => ({
  useIsMobile: () => false,
}));

vi.mock("@/stores/uiStore", () => ({
  useUIStore: () => ({
    copilotOpen: true,
    toggleCopilot: vi.fn(),
  }),
}));

describe("CopilotPanel", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    NAVIGATION_MOCK.pathname = "/deals";
    NAVIGATION_MOCK.searchParams = new URLSearchParams();
  });

  it("warns users when a financial command is run without a linked deal", async () => {
    const { streamAgentRun } = await import("@/lib/agentStream");
    const { rerender } = render(<CopilotPanel />);

    fireEvent.click(screen.getByRole("button", { name: /Run Full Underwriting/i }));
    fireEvent.click(screen.getByRole("button", { name: "Run Copilot" }));

    expect(
      await screen.findByText(/pick a deal from deals first/i),
    ).toBeInTheDocument();
    expect(streamAgentRun).not.toHaveBeenCalled();

    NAVIGATION_MOCK.pathname = "/deals/11111111-1111-4111-8111-111111111111";
    rerender(<CopilotPanel />);

    fireEvent.click(screen.getByRole("button", { name: /Run Full Underwriting/i }));
    fireEvent.click(screen.getByRole("button", { name: "Run Copilot" }));
    expect(streamAgentRun).toHaveBeenCalledTimes(1);
  });

  it("uses non-default command library actions when selected from the command list", async () => {
    const { streamAgentRun } = await import("@/lib/agentStream");
    (streamAgentRun as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    NAVIGATION_MOCK.pathname = "/deals/11111111-1111-4111-8111-111111111111";
    render(<CopilotPanel />);

    fireEvent.click(screen.getByRole("button", { name: /Create DD Checklist/i }));
    fireEvent.click(screen.getByRole("button", { name: "Show Commands" }));
    fireEvent.click(screen.getByRole("button", { name: /Underwriting Snapshot/i }));
    fireEvent.click(screen.getByRole("button", { name: "Run Copilot" }));

    await waitFor(() => {
      expect(streamAgentRun).toHaveBeenCalledTimes(1);
    });
    const call = (streamAgentRun as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(call?.agentName).toBe("finance");
    expect(call?.query).toMatch(/fast underwriting snapshot/i);
  });

  it("allows non-financial commands without a linked deal", async () => {
    const { streamAgentRun } = await import("@/lib/agentStream");
    (streamAgentRun as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    NAVIGATION_MOCK.pathname = "/deals";
    render(<CopilotPanel />);

    fireEvent.click(screen.getByRole("button", { name: /Create DD Checklist/i }));
    fireEvent.click(screen.getByRole("button", { name: "Run Copilot" }));

    await waitFor(() => {
      expect(streamAgentRun).toHaveBeenCalledTimes(1);
    });
    const call = (streamAgentRun as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(call).toMatchObject({
      agentName: "operations",
      projectId: null,
    });
    expect(call.query).toMatch(/Create a due diligence checklist/);
  });

  it("normalizes gateway service errors for user-friendly output", async () => {
    const { streamAgentRun } = await import("@/lib/agentStream");
    (streamAgentRun as ReturnType<typeof vi.fn>).mockImplementation(
      async (options: {
        onChunk: (chunk: { event: string; data: Record<string, unknown> }) => void;
      }) => {
        options.onChunk({
          event: "message",
          data: {
            type: "error",
            message: "Gateway DB proxy error (500): unable to parse request.",
          },
        });
      },
    );

    NAVIGATION_MOCK.pathname = "/deals/22222222-2222-4222-8222-222222222222";
    render(<CopilotPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Run Copilot" }));

    expect(
      await screen.findByText(
        /copilot service returned an internal error\. Please retry the command\./i,
      ),
    ).toBeInTheDocument();
  });

  it("normalizes 5xx stream errors for user-friendly output", async () => {
    const { streamAgentRun } = await import("@/lib/agentStream");
    (streamAgentRun as ReturnType<typeof vi.fn>).mockImplementation(async (options: {
      onError: (error: Error) => void;
    }) => {
      options.onError(new Error("Stream failed with status 503"));
    });

    NAVIGATION_MOCK.pathname = "/deals/11111111-1111-4111-8111-111111111111";
    render(<CopilotPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Run Copilot" }));

    expect(
      await screen.findByText(
        /copilot service returned an internal error\. Please retry the command\./i,
      ),
    ).toBeInTheDocument();
  });
});
