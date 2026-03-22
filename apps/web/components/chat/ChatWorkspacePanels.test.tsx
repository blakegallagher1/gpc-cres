import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AgentTrustEnvelope } from "@/types";
import { ChatWorkspaceInspector } from "./ChatWorkspacePanels";

vi.mock("@/components/agent-state/AgentStatePanel", () => ({
  AgentStatePanel: ({
    confidence,
    lastAgentName,
    verificationSteps,
  }: {
    confidence?: number;
    lastAgentName?: string;
    verificationSteps?: string[];
  }) => (
    <div data-testid="agent-state-panel">
      <p>{lastAgentName}</p>
      <p>{Math.round((confidence ?? 0) * 100)}%</p>
      {verificationSteps?.map((step) => <p key={step}>{step}</p>)}
    </div>
  ),
}));

vi.mock("@/lib/hooks/useAgents", () => ({
  useAgents: () => ({
    agents: [
      {
        id: "coordinator",
        name: "coordinator",
        model: "gpt-5.2",
        description: "Routes work across the desk.",
      },
      {
        id: "finance",
        name: "finance",
        model: "gpt-5.2",
        description: "Handles underwriting and capital structure.",
      },
    ],
    isLoading: false,
    isError: false,
    mutate: vi.fn(),
  }),
}));

const BASE_PROPS = {
  activeAgentLabel: "Coordinator",
  attachmentStatusLabel: "Select deal",
  conversationCount: 3,
  recentConversationLabel: "1 recent chats",
  threadStatusLabel: "Draft until first response",
  useAgentSummaryPanel: true,
} as const;

const SUMMARY: AgentTrustEnvelope = {
  toolsInvoked: ["underwriting_model"],
  packVersionsUsed: ["jurisdiction_pack:1.2.3"],
  evidenceCitations: [],
  confidence: 0.82,
  missingEvidence: ["Rent roll not attached"],
  verificationSteps: ["Confirm current rent roll"],
  proofChecks: ["Compared leverage to debt yield floor"],
  toolFailures: [],
  lastAgentName: "Finance",
  errorSummary: null,
  durationMs: 1420,
};

describe("ChatWorkspaceInspector", () => {
  it("shows the run brief by default when no verification summary is available", () => {
    render(
      <ChatWorkspaceInspector
        {...BASE_PROPS}
        agentSummary={null}
      />,
    );

    expect(screen.getByText("Verification and specialist coverage")).toBeInTheDocument();
    expect(screen.getByText("What this desk expects")).toBeInTheDocument();
    expect(screen.getByText("Stateful thread:")).toBeInTheDocument();
    expect(
      screen.queryByText("Verification fills in after the first response."),
    ).not.toBeInTheDocument();
  });

  it("renders the verification panel first when a trust summary is present", () => {
    render(
      <ChatWorkspaceInspector
        {...BASE_PROPS}
        agentSummary={SUMMARY}
      />,
    );

    expect(screen.getByTestId("agent-state-panel")).toBeInTheDocument();
    expect(screen.getByText("Finance")).toBeInTheDocument();
    expect(screen.getByText("82%")).toBeInTheDocument();
    expect(screen.getByText("Confirm current rent roll")).toBeInTheDocument();
  });

  it("promotes the inspector to verification when trust data arrives after first render", () => {
    const { rerender } = render(
      <ChatWorkspaceInspector
        {...BASE_PROPS}
        agentSummary={null}
      />,
    );

    expect(screen.getByText("What this desk expects")).toBeInTheDocument();

    rerender(
      <ChatWorkspaceInspector
        {...BASE_PROPS}
        agentSummary={SUMMARY}
      />,
    );

    expect(screen.getByTestId("agent-state-panel")).toBeInTheDocument();
    expect(screen.getByText("82%")).toBeInTheDocument();
  });
});
