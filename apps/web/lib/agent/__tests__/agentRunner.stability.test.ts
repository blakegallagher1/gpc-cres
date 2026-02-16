import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    run: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      createMany: vi.fn(),
      findMany: vi.fn(),
    },
    conversation: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    message: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    orgMembership: {
      findMany: vi.fn(),
    },
    jurisdiction: {
      findFirst: vi.fn(),
    },
    deal: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("../executeAgent", () => ({
  executeAgentWorkflow: vi.fn(),
  toDatabaseRunId: (runId: string) => `uuid-${runId}`,
}));

vi.mock("@/lib/workflowClient", () => ({
  getTemporalClient: vi.fn(),
}));

import { getTemporalClient } from "@/lib/workflowClient";
import { prisma } from "@entitlement-os/db";
import { executeAgentWorkflow } from "../executeAgent";
import { runAgentWorkflow } from "../agentRunner";

const BASE_REQUEST = {
  orgId: "org-stability",
  userId: "user-stability",
  message: "Assess parcel entitlement path",
  runType: "ENRICHMENT",
  correlationId: "shared-stability-run",
  persistConversation: false,
};

function configureClaimReplayState(params: {
  openaiResponseId: string | null;
  startedAt: Date;
}) {
  let lookupCount = 0;
  prisma.run.findUnique = vi.fn(async (query: { select?: { startedAt?: unknown } }) => {
    if (query.select?.startedAt) {
      return {
        status: "running",
        outputJson: null,
        inputHash: "input-hash",
        openaiResponseId: params.openaiResponseId,
        startedAt: params.startedAt,
      };
    }

    lookupCount += 1;
    if (lookupCount === 1) {
      return {
        status: "running",
        outputJson: null,
        inputHash: "input-hash",
        openaiResponseId: null,
        startedAt: new Date(),
      };
    }

    if (lookupCount === 3) {
      return {
        status: "running",
        outputJson: null,
        inputHash: "input-hash",
        openaiResponseId: params.openaiResponseId,
        startedAt: params.startedAt,
      };
    }

    return null;
  });
}

function makeWorkflowResult(runId: string) {
  return {
    result: {
      runId,
      status: "succeeded",
      finalOutput: "ok",
      finalReport: null,
      toolsInvoked: [],
      trust: {
        toolsInvoked: [],
        packVersionsUsed: [],
        evidenceCitations: [],
        evidenceHash: null,
        confidence: 0.96,
        missingEvidence: [],
        verificationSteps: [],
        lastAgentName: "coordinator",
        errorSummary: null,
        durationMs: 11,
        toolFailures: [],
        proofChecks: [],
        retryAttempts: 0,
        retryMaxAttempts: 0,
        retryMode: "local",
        fallbackLineage: ["local-fallback"],
        fallbackReason: "forced local fallback",
      },
      openaiResponseId: "openai-response-id",
      inputHash: "input-hash",
    },
    conversationId: "conversation-id",
    agentInput: [{ role: "user", content: "Assess parcel entitlement path" }],
  };
}

function setTemporalUnavailable() {
  (getTemporalClient as ReturnType<typeof vi.fn>).mockResolvedValue({
    workflow: {
      start: vi
        .fn()
        .mockRejectedValue(new Error("Temporal start failed")),
      getHandle: vi
        .fn()
        .mockResolvedValue({
          describe: vi
            .fn()
            .mockRejectedValue(new Error("no existing temporal handle")),
        }),
    },
  });
}

describe("runAgentWorkflow local fallback resilience", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TEMPORAL_ADDRESS = "http://temporal.local:7233";
    setTemporalUnavailable();

    prisma.message.findMany.mockResolvedValue([]);

    (executeAgentWorkflow as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeWorkflowResult(`agent-run-${BASE_REQUEST.correlationId}`),
    );
  });

  it("allows stale lease recovery on explicit duplicate local-fallback collisions", async () => {
    const staleRunRecord = {
      openaiResponseId: "stale-lease-token",
      startedAt: new Date(Date.now() - 20 * 60 * 1000),
    };

    configureClaimReplayState(staleRunRecord);

    prisma.run.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });

    await runAgentWorkflow(BASE_REQUEST);
    await runAgentWorkflow(BASE_REQUEST);

    expect((executeAgentWorkflow as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2);
  });

  it("rejects fresh duplicate local-fallback attempts when lease is still alive", async () => {
    const activeFreshRun = {
      openaiResponseId: "active-lease-token",
      startedAt: new Date(Date.now() - 30 * 1000),
    };

    configureClaimReplayState(activeFreshRun);

    prisma.run.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 });

    await runAgentWorkflow(BASE_REQUEST);

    await expect(runAgentWorkflow(BASE_REQUEST)).rejects.toThrow(
      "Local run lease unavailable for agent-run-shared-stability-run.",
    );

    expect((executeAgentWorkflow as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });
});
