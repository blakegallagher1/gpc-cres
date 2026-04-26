import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentTrustEnvelope } from "@/types";

const {
  runUpdateMock,
  dispatchEventMock,
  autoFeedRunMock,
  isAgentOsFeatureEnabledMock,
  runCriticEvaluationMock,
  loggerWarnMock,
} = vi.hoisted(() => ({
  runUpdateMock: vi.fn(),
  dispatchEventMock: vi.fn(async () => undefined),
  autoFeedRunMock: vi.fn(async () => undefined),
  isAgentOsFeatureEnabledMock: vi.fn(() => false),
  runCriticEvaluationMock: vi.fn(async () => undefined),
  loggerWarnMock: vi.fn(),
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    run: {
      update: runUpdateMock,
    },
  },
}));

vi.mock("@entitlement-os/openai", () => ({
  isAgentOsFeatureEnabled: isAgentOsFeatureEnabledMock,
  runCriticEvaluation: runCriticEvaluationMock,
}));

vi.mock("@gpc/server/automation/chat-events", () => ({
  dispatchChatAutomationEvent: dispatchEventMock,
}));

vi.mock("@/lib/agent/dataAgentAutoFeed.service", () => ({
  autoFeedRun: autoFeedRunMock,
}));

vi.mock("./loggerAdapter", () => ({
  logger: {
    warn: loggerWarnMock,
  },
}));

import { runAgentPostRunEffects } from "./agentPostRunEffects";

const TRUST: AgentTrustEnvelope = {
  toolsInvoked: ["screen_full"],
  packVersionsUsed: ["pack-v1"],
  evidenceCitations: [],
  evidenceHash: "hash-1",
  confidence: 0.81,
  missingEvidence: [],
  verificationSteps: [],
  lastAgentName: "Coordinator",
  errorSummary: null,
  durationMs: 3200,
  toolFailures: [],
  proofChecks: [],
};

describe("runAgentPostRunEffects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runUpdateMock.mockResolvedValue({ id: "run-1" });
    dispatchEventMock.mockResolvedValue(undefined);
    autoFeedRunMock.mockResolvedValue(undefined);
    isAgentOsFeatureEnabledMock.mockReturnValue(false);
    runCriticEvaluationMock.mockResolvedValue(undefined);
  });

  it("dispatches learning and auto-feed side effects for completed persisted runs", async () => {
    await runAgentPostRunEffects({
      runId: "run-1",
      orgId: "org-1",
      userId: "user-1",
      conversationId: "conv-1",
      dealId: "deal-1",
      jurisdictionId: "jurisdiction-1",
      runType: "ENRICHMENT",
      status: "succeeded",
      firstUserInput: "Run parcel screening",
      queryIntent: "analysis",
      skipRunPersistence: false,
      ingestionOnly: false,
      finalText: "{\"summary\":\"done\"}",
      finalReport: null,
      trust: TRUST,
      retrievalContext: null,
      retrievalSummary: { hits: 1 },
    });

    expect(runUpdateMock).toHaveBeenCalledWith({
      where: { id: "run-1" },
      data: {
        memoryPromotionStatus: "pending",
        memoryPromotionError: null,
        memoryPromotedAt: null,
      },
    });
    expect(dispatchEventMock).toHaveBeenCalledWith({
      type: "agent.run.completed",
      runId: "run-1",
      orgId: "org-1",
      userId: "user-1",
      conversationId: "conv-1",
      dealId: "deal-1",
      jurisdictionId: "jurisdiction-1",
      runType: "ENRICHMENT",
      status: "succeeded",
      inputPreview: "Run parcel screening",
      queryIntent: "analysis",
    });
    expect(autoFeedRunMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org-1",
        runId: "run-1",
        runType: "ENRICHMENT",
        finalOutputText: "{\"summary\":\"done\"}",
        autoScore: 0.81,
        retrievalMeta: expect.objectContaining({
          runId: "run-1",
          queryIntent: "analysis",
          retrievalSummary: { hits: 1 },
        }),
      }),
    );
  });

  it("skips persistence-bound side effects for ephemeral or ingestion-only runs", async () => {
    await runAgentPostRunEffects({
      runId: "run-1",
      orgId: "org-1",
      userId: "user-1",
      status: "succeeded",
      firstUserInput: "Store this memo",
      queryIntent: "analysis",
      skipRunPersistence: true,
      ingestionOnly: true,
      finalText: "done",
      finalReport: null,
      trust: TRUST,
      retrievalContext: null,
      retrievalSummary: {},
    });

    expect(runUpdateMock).not.toHaveBeenCalled();
    expect(dispatchEventMock).not.toHaveBeenCalled();
    expect(autoFeedRunMock).not.toHaveBeenCalled();
  });

  it("runs critic evaluation behind the feature flag", async () => {
    isAgentOsFeatureEnabledMock.mockImplementation((flag: string) => flag === "criticEvaluation");

    await runAgentPostRunEffects({
      runId: "run-1",
      orgId: "org-1",
      userId: "user-1",
      status: "failed",
      firstUserInput: "Run parcel screening",
      queryIntent: "analysis",
      skipRunPersistence: true,
      ingestionOnly: false,
      finalText: "failed",
      finalReport: null,
      trust: {
        ...TRUST,
        toolFailures: ["screen_full failed"],
        missingEvidence: ["missing parcel citation"],
      },
      retrievalContext: null,
      retrievalSummary: {},
    });

    expect(runCriticEvaluationMock).toHaveBeenCalledWith({
      runId: "run-1",
      orgId: "org-1",
      finalOutput: "failed",
      toolsInvoked: ["screen_full"],
      toolFailures: ["screen_full failed"],
      missingEvidence: ["missing parcel citation"],
    });
  });
});
