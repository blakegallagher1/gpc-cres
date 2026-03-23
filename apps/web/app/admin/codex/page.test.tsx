// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { reconnectMock } = vi.hoisted(() => ({
  reconnectMock: vi.fn(),
}));

vi.mock("./_components/ChatPanel", () => ({
  ChatPanel: () => <div>Chat Panel</div>,
}));

vi.mock("./_components/ApprovalModal", () => ({
  ApprovalModal: () => null,
}));

vi.mock("./_components/DiffViewer", () => ({
  DiffViewer: () => <div>Diff Viewer</div>,
}));

vi.mock("./_components/InputBar", () => ({
  InputBar: () => <div>Input Bar</div>,
}));

vi.mock("./_components/PlanChecklist", () => ({
  PlanChecklist: () => <div>Plan Checklist</div>,
}));

vi.mock("./_components/StatusBar", () => ({
  StatusBar: () => <div>Status Bar</div>,
}));

vi.mock("./_components/ThreadSidebar", () => ({
  ThreadSidebar: () => <div>Thread Sidebar</div>,
}));

vi.mock("./_hooks/useApprovals", () => ({
  useApprovals: () => ({
    activeApproval: null,
    approvalCount: 0,
    pushApproval: vi.fn(),
    popCurrent: vi.fn(),
  }),
}));

vi.mock("./_hooks/useThreads", () => ({
  useThreads: () => ({
    threads: [],
    isLoadingThreads: false,
    refreshThreads: vi.fn(),
    archiveThread: vi.fn(),
    startThread: vi.fn(),
    resumeThread: vi.fn(),
  }),
}));

vi.mock("./_hooks/useCodexSocket", () => ({
  useCodexSocket: () => ({
    status: "reconnecting",
    isConnected: false,
    send: vi.fn(),
    sendRequest: vi.fn(),
    reconnect: reconnectMock,
    connectionStatusText: "reconnecting",
    connectionError: "WebSocket error connecting to upstream",
  }),
}));

import CodexAdminPage from "./page";

describe("CodexAdminPage", () => {
  beforeEach(() => {
    reconnectMock.mockReset();
    window.localStorage.clear();
  });

  it("renders a clean reconnect state instead of hanging on connecting", async () => {
    const user = userEvent.setup();
    render(<CodexAdminPage />);

    expect(screen.getByText("Reconnecting to Codex")).toBeInTheDocument();
    expect(
      screen.getByText(
        "The Codex relay is unavailable. Retry the connection or check the upstream Codex service.",
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reconnect now" }));
    expect(reconnectMock).toHaveBeenCalledTimes(1);
  });
});
