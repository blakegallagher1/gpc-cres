import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    run: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@openai/agents", () => ({
  run: vi.fn(),
  user: vi.fn(),
  assistant: vi.fn(),
}));

vi.mock("@entitlement-os/openai", () => ({
  inferQueryIntentFromText: vi.fn(() => "analysis"),
  createIntentAwareCoordinator: vi.fn(() => ({ id: "coordinator-agent" })),
  evaluateProofCompliance: vi.fn(() => []),
  buildAgentStreamRunOptions: vi.fn(() => ({})),
  getProofGroupsForIntent: vi.fn(() => []),
}));
vi.mock("../../../../services/retrieval.service", () => ({
  unifiedRetrieval: vi.fn(async () => [
    {
      id: "r1",
      source: "semantic",
      text: "retrieval note",
      score: 0.92,
      confidence: 0.9,
      sourceTimestamp: "2026-01-01T00:00:00.000Z",
      metadata: { source: "seed" },
      recencyScore: 0.9,
      semanticScore: 0.92,
      sparseScore: 0.5,
      graphScore: 0,
      sourceScore: 0.9,
      timestamp: "2026-01-01T00:00:00.000Z",
      subjectId: "run-contract",
      objectId: "obj",
    },
  ]),
}));

import {
  AGENT_RUN_STATE_KEYS,
  AGENT_RUN_STATE_SCHEMA_VERSION,
  AGENT_RUN_STATE_STATUS,
} from "@entitlement-os/shared";
import { executeAgentWorkflow } from "../executeAgent";

const VALID_REPORT = {
  schema_version: "1.0",
  generated_at: "2025-01-01T00:00:00.000Z",
  task_understanding: {
    summary: "Validate parcel entitlement pathway",
  },
  execution_plan: {
    summary: "Collect evidence and synthesize recommendation",
    steps: [
      {
        agent: "coordinator",
        responsibility: "Coordinate agent calls",
        rationale: "Core flow",
        timeline: "T+1 day",
      },
    ],
  },
  agent_outputs: [
    {
      agent: "coordinator",
      summary: "Analysis complete",
      confidence: 0.91,
    },
  ],
  synthesis: {
    recommendation: "Proceed",
    rationale: "Evidence is sufficient",
    confidence: 0.87,
  },
  key_assumptions: [],
  uncertainty_map: [],
  next_steps: [
    {
      action: "Finalize underwriter packet",
      owner: "Analyst",
      priority: "high",
    },
  ],
  sources: [],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizePersistedOutput(output: Record<string, unknown>): Record<string, unknown> {
  const cloned = JSON.parse(JSON.stringify(output)) as Record<string, unknown>;
  if (isRecord(cloned.runState)) {
    delete cloned.runState[AGENT_RUN_STATE_KEYS.lastUpdatedAt];
    delete cloned.runState[AGENT_RUN_STATE_KEYS.durationMs];
    delete cloned.runState[AGENT_RUN_STATE_KEYS.runStartedAt];
    delete cloned.runState[AGENT_RUN_STATE_KEYS.leaseExpiresAt];
    if (isRecord(cloned.runState[AGENT_RUN_STATE_KEYS.retrievalContext])) {
      delete (cloned.runState[AGENT_RUN_STATE_KEYS.retrievalContext] as Record<string, unknown>)
        .generatedAt;
    }
  }
  delete cloned[AGENT_RUN_STATE_KEYS.durationMs];
  if (isRecord(cloned[AGENT_RUN_STATE_KEYS.retrievalContext] as Record<string, unknown>)) {
    delete (cloned[AGENT_RUN_STATE_KEYS.retrievalContext] as Record<string, unknown>).generatedAt;
  }
  return cloned;
}

describe("executeAgentWorkflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENAI_API_KEY = "test-key";
  });

  it("persists AgentRunOutputJson with required runState contract fields", async () => {
    const { prisma } = await vi.importMock("@entitlement-os/db");
    const openAiAgents = await vi.importMock("@openai/agents");
    const { run } = openAiAgents as {
      run: ReturnType<typeof vi.fn>;
      user: ReturnType<typeof vi.fn>;
      assistant: ReturnType<typeof vi.fn>;
    };

    prisma.run.findUnique.mockResolvedValue(null);
    prisma.run.upsert.mockResolvedValue({
      id: "run-contract",
      status: "running",
      inputHash: "input-hash",
      outputJson: null,
      openaiResponseId: null,
      startedAt: new Date("2025-01-01T00:00:00.000Z"),
      finishedAt: null,
    });
    (run as ReturnType<typeof vi.fn>).mockResolvedValue({
      finalOutput: JSON.stringify(VALID_REPORT),
      lastResponseId: "openai-response-id",
    });
    prisma.run.update.mockResolvedValue({ status: "succeeded" });

    await executeAgentWorkflow({
      orgId: "org-test",
      userId: "user-test",
      conversationId: "conversation-test",
      runId: "run-contract",
      input: [{ role: "user", content: "Run entitlement analysis" }],
      runType: "ENRICHMENT",
      correlationId: "corr-local",
    });

    expect(prisma.run.update).toHaveBeenCalledTimes(1);
    const updateCall = prisma.run.update.mock.calls[0][0];
    const outputJson = updateCall.data.outputJson as Record<string, unknown>;
    const runState = outputJson.runState as Record<string, unknown>;

    expect(outputJson[AGENT_RUN_STATE_KEYS.partialOutput]).toBeUndefined();
    expect(runState).toMatchObject({
      schemaVersion: AGENT_RUN_STATE_SCHEMA_VERSION,
      runId: "run-contract",
      status: AGENT_RUN_STATE_STATUS.SUCCEEDED,
    });
    expect(runState[AGENT_RUN_STATE_KEYS.correlationId]).toBe("corr-local");
    expect(runState[AGENT_RUN_STATE_KEYS.status]).toBe("succeeded");
    expect(runState[AGENT_RUN_STATE_KEYS.runId]).toBe("run-contract");
    expect(typeof runState[AGENT_RUN_STATE_KEYS.lastUpdatedAt]).toBe("string");
    expect(typeof runState[AGENT_RUN_STATE_KEYS.durationMs]).toBe("number");
    expect(JSON.parse(String(runState[AGENT_RUN_STATE_KEYS.partialOutput]))).toEqual(
      VALID_REPORT,
    );
    expect(outputJson.correlationId).toBe("corr-local");
    expect(Array.isArray(runState[AGENT_RUN_STATE_KEYS.toolFailures])).toBe(true);
    expect(Array.isArray(runState[AGENT_RUN_STATE_KEYS.proofChecks])).toBe(true);
    expect(typeof runState[AGENT_RUN_STATE_KEYS.retryAttempts]).toBe("number");
    expect(typeof runState[AGENT_RUN_STATE_KEYS.retryMaxAttempts]).toBe("number");
    expect(runState[AGENT_RUN_STATE_KEYS.retryMode]).toBe("local");
    expect(runState[AGENT_RUN_STATE_KEYS.evidenceRetryPolicy]).toEqual({
      enabled: false,
      threshold: 3,
      missingEvidenceCount: 0,
      attempts: 1,
      maxAttempts: 3,
      shouldRetry: false,
      nextAttempt: 1,
      nextRetryMode: "local",
      reason: "Policy not triggered.",
    });
    expect(outputJson.evidenceRetryPolicy).toEqual(
      runState[AGENT_RUN_STATE_KEYS.evidenceRetryPolicy],
    );
    expect(runState[AGENT_RUN_STATE_KEYS.fallbackLineage]).toBeUndefined();
    expect(runState[AGENT_RUN_STATE_KEYS.fallbackReason]).toBeUndefined();
    expect(runState[AGENT_RUN_STATE_KEYS.retrievalContext]).toMatchObject({
      query: "analysis",
      subjectId: "run-contract",
    });
    expect(
      Array.isArray((runState[AGENT_RUN_STATE_KEYS.retrievalContext] as Record<string, unknown>).results),
    ).toBe(true);
    expect(Array.isArray(outputJson.toolFailures)).toBe(true);
    expect(Array.isArray(outputJson.proofChecks)).toBe(true);
    expect(typeof outputJson.retryAttempts).toBe("number");
    expect(typeof outputJson.retryMaxAttempts).toBe("number");
    expect(outputJson.retryMode).toBe("local");
    expect(outputJson.retrievalContext).toMatchObject({
      query: "analysis",
    });
    expect(outputJson.fallbackLineage).toBeUndefined();
    expect(outputJson.fallbackReason).toBeUndefined();
  });

  it("replays deterministically for equivalent local reruns", async () => {
    const { prisma } = await vi.importMock("@entitlement-os/db");
    const openAiAgents = await vi.importMock("@openai/agents");
    const { run } = openAiAgents as {
      run: ReturnType<typeof vi.fn>;
      user: ReturnType<typeof vi.fn>;
      assistant: ReturnType<typeof vi.fn>;
    };

    const fixedTime = new Date("2026-02-14T00:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(fixedTime);

    try {
      prisma.run.findUnique.mockResolvedValue(null);
      prisma.run.upsert.mockResolvedValue({
        id: "run-contract",
        status: "running",
        inputHash: "input-hash",
        outputJson: null,
        openaiResponseId: null,
        startedAt: fixedTime,
        finishedAt: null,
      });
      prisma.run.update.mockResolvedValue({ status: "succeeded" });
      (run as ReturnType<typeof vi.fn>).mockResolvedValue({
        finalOutput: JSON.stringify(VALID_REPORT),
        lastResponseId: "openai-response-id",
      });

      const request = {
        orgId: "org-test",
        userId: "user-test",
        conversationId: "conversation-test",
        runId: "run-contract",
        input: [{ role: "user", content: "Run entitlement analysis" }],
        runType: "ENRICHMENT",
        correlationId: "corr-local",
      };

      await executeAgentWorkflow(request);
      await executeAgentWorkflow(request);

      const firstOutput = normalizePersistedOutput(
        prisma.run.update.mock.calls[0][0].data.outputJson as Record<string, unknown>,
      );
      const secondOutput = normalizePersistedOutput(
        prisma.run.update.mock.calls[1][0].data.outputJson as Record<string, unknown>,
      );

      expect(firstOutput).toEqual(secondOutput);
    } finally {
      vi.useRealTimers();
    }
  });
});
