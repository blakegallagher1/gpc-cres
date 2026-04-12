import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  dbMock,
  dispatchEventMock,
  autoFeedRunMock,
  runCriticEvaluationMock,
} = vi.hoisted(() => ({
  dbMock: {
    prisma: {
      run: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        upsert: vi.fn(),
        update: vi.fn(),
      },
    },
  },
  dispatchEventMock: vi.fn(async () => undefined),
  autoFeedRunMock: vi.fn(async () => undefined),
  runCriticEvaluationMock: vi.fn(async () => undefined),
}));

vi.mock("@entitlement-os/db", () => dbMock);

vi.mock("@openai/agents", () => ({
  run: vi.fn(),
  user: vi.fn((value: unknown) => value),
  assistant: vi.fn((value: unknown) => value),
}));

vi.mock("@entitlement-os/openai", () => ({
  inferQueryIntentFromText: vi.fn(() => "analysis"),
  inferQueryIntentFromDealContext: vi.fn(() => null),
  createConfiguredCoordinator: vi.fn(() => ({ id: "coordinator-agent", tools: [] })),
  applyAgentToolPolicy: vi.fn((coordinator: { tools?: Array<{ name?: string }> }) => {
    const configuredToolNames = Array.isArray(coordinator.tools)
      ? coordinator.tools
          .map((tool) => tool?.name)
          .filter((name): name is string => typeof name === "string" && name.length > 0)
      : [];
    return {
      preFilterTools: [...configuredToolNames],
      configuredToolNames,
      memoryToolsPresent: configuredToolNames.filter((name) =>
        [
          "store_memory",
          "get_entity_truth",
          "get_entity_memory",
          "record_memory_event",
          "lookup_entity_by_address",
        ].includes(name),
      ),
      missingMemoryTools: [],
    };
  }),
  evaluateProofCompliance: vi.fn(() => []),
  buildAgentStreamRunOptions: vi.fn(() => ({})),
  captureAgentError: vi.fn(),
  captureAgentWarning: vi.fn(),
  collapseRepeatedTextArtifacts: vi.fn((value: string) => value),
  filterToolsForIntent: vi.fn((_: unknown, tools: unknown[]) => tools),
  getAgentOsConfig: vi.fn(() => ({ enabled: false })),
  getProofGroupsForIntent: vi.fn(() => []),
  getToolDefinitionName: vi.fn(() => null),
  setupAgentTracing: vi.fn(),
  serializeRunStateEnvelope: vi.fn((input: unknown) => input),
  deserializeRunStateEnvelope: vi.fn(() => null),
  createTrajectoryRecorder: vi.fn(() => ({
    record: vi.fn(),
    snapshot: vi.fn(() => [{ kind: "text_delta" }]),
  })),
  extractUsageSummary: vi.fn(() => null),
  isAgentOsFeatureEnabled: vi.fn(() => false),
  maybeTrimToolOutput: vi.fn((value: unknown) => ({ value, wasTrimmed: false })),
  runCriticEvaluation: runCriticEvaluationMock,
  WEB_ADDITIONAL_TOOL_ALLOWLIST: [],
}));

vi.mock("@/lib/automation/events", () => ({
  dispatchEvent: dispatchEventMock,
}));

vi.mock("@/lib/agent/dataAgentAutoFeed.service", () => ({
  autoFeedRun: autoFeedRunMock,
}));

vi.mock("@/lib/services/deal-reader", () => ({
  getDealReaderById: vi.fn(async () => null),
}));

vi.mock("../retrievalAdapter", () => ({
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
      subjectId: "run-learning",
      objectId: "obj",
    },
  ]),
}));

vi.mock("../loggerAdapter", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  recordDataAgentAutoFeed: vi.fn(),
}));

import { executeAgentWorkflow, toDatabaseRunId } from "../executeAgent";

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

const SOURCE_RUN_ID = "run-learning";
const NORMALIZED_RUN_ID = toDatabaseRunId(SOURCE_RUN_ID);
const STARTED_AT = new Date("2025-01-01T00:00:00.000Z");

function makeRunningDbRun() {
  return {
    id: NORMALIZED_RUN_ID,
    status: "running",
    inputHash: "input-hash",
    outputJson: null,
    serializedState: null,
    openaiResponseId: null,
    startedAt: STARTED_AT,
    finishedAt: null,
  };
}

function makeCompletedDbRun() {
  return {
    id: NORMALIZED_RUN_ID,
    status: "succeeded",
    inputHash: "input-hash",
    outputJson: {
      finalOutput: JSON.stringify(VALID_REPORT),
      finalReport: VALID_REPORT,
      toolsInvoked: [],
      confidence: 0.87,
      missingEvidence: [],
      verificationSteps: [],
      toolFailures: [],
      proofChecks: [],
      packVersionsUsed: [],
      evidenceCitations: [],
    },
    serializedState: null,
    openaiResponseId: "openai-response-id",
    startedAt: STARTED_AT,
    finishedAt: new Date("2025-01-01T00:00:05.000Z"),
  };
}

async function loadAgentsMock() {
  return vi.importMock("@openai/agents") as Promise<{
    run: ReturnType<typeof vi.fn>;
    user: ReturnType<typeof vi.fn>;
    assistant: ReturnType<typeof vi.fn>;
  }>;
}

describe("executeAgentWorkflow agent learning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENAI_API_KEY = "test-key";
    dbMock.prisma.run.findFirst.mockResolvedValue(null);
    dbMock.prisma.run.upsert.mockResolvedValue(makeRunningDbRun());
    dbMock.prisma.run.update.mockResolvedValue({ status: "succeeded" });
    dispatchEventMock.mockResolvedValue(undefined);
    autoFeedRunMock.mockResolvedValue(undefined);
    runCriticEvaluationMock.mockResolvedValue(undefined);
  });

  it("sets memoryPromotionStatus to pending for completed runs", async () => {
    const { run } = await loadAgentsMock();
    run.mockResolvedValue({
      finalOutput: JSON.stringify(VALID_REPORT),
      lastResponseId: "openai-response-id",
    });

    await executeAgentWorkflow({
      orgId: "org-test",
      userId: "user-test",
      conversationId: "conversation-test",
      runId: SOURCE_RUN_ID,
      input: [{ role: "user", content: "Run entitlement analysis" }],
      runType: "ENRICHMENT",
    });

    expect(dbMock.prisma.run.update).toHaveBeenNthCalledWith(2, {
      where: { id: NORMALIZED_RUN_ID },
      data: {
        memoryPromotionStatus: "pending",
        memoryPromotionError: null,
        memoryPromotedAt: null,
      },
    });
  });

  it("dispatches agent.run.completed once for completed runs", async () => {
    const { run } = await loadAgentsMock();
    run.mockResolvedValue({
      finalOutput: JSON.stringify(VALID_REPORT),
      lastResponseId: "openai-response-id",
    });

    await executeAgentWorkflow({
      orgId: "org-test",
      userId: "user-test",
      conversationId: "conversation-test",
      dealId: "deal-test",
      jurisdictionId: "jurisdiction-test",
      runId: SOURCE_RUN_ID,
      input: [{ role: "user", content: "Run entitlement analysis" }],
      runType: "ENRICHMENT",
    });

    expect(dispatchEventMock).toHaveBeenCalledTimes(1);
    expect(dispatchEventMock).toHaveBeenCalledWith({
      type: "agent.run.completed",
      runId: NORMALIZED_RUN_ID,
      orgId: "org-test",
      userId: "user-test",
      conversationId: "conversation-test",
      dealId: "deal-test",
      jurisdictionId: "jurisdiction-test",
      runType: "ENRICHMENT",
      status: "succeeded",
      inputPreview: "Run entitlement analysis",
      queryIntent: "analysis",
    });
  });

  it("does not dispatch learning promotion for pending-approval runs", async () => {
    const { run } = await loadAgentsMock();
    run.mockResolvedValue({
      finalOutput: "",
      lastResponseId: "openai-response-id",
      interruptions: [
        {
          name: "query_property_db",
          toolCallId: "tool-call-1",
        },
      ],
      state: {
        toString: () => "serialized-run-state",
      },
    });

    const result = await executeAgentWorkflow({
      orgId: "org-test",
      userId: "user-test",
      conversationId: "conversation-test",
      runId: SOURCE_RUN_ID,
      input: [{ role: "user", content: "Run entitlement analysis" }],
      runType: "ENRICHMENT",
    });

    expect(result.status).toBe("running");
    expect(dispatchEventMock).not.toHaveBeenCalled();
    expect(
      dbMock.prisma.run.update.mock.calls.some(
        ([call]) => "memoryPromotionStatus" in (call.data as Record<string, unknown>),
      ),
    ).toBe(false);
  });

  it("does not re-dispatch when replaying a completed run", async () => {
    const { run } = await loadAgentsMock();
    run.mockResolvedValue({
      finalOutput: JSON.stringify(VALID_REPORT),
      lastResponseId: "openai-response-id",
    });
    dbMock.prisma.run.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(makeCompletedDbRun());

    const request = {
      orgId: "org-test",
      userId: "user-test",
      conversationId: "conversation-test",
      runId: SOURCE_RUN_ID,
      input: [{ role: "user", content: "Run entitlement analysis" }],
      runType: "ENRICHMENT" as const,
    };

    await executeAgentWorkflow(request);
    expect(dispatchEventMock).toHaveBeenCalledTimes(1);

    dispatchEventMock.mockClear();

    const replayed = await executeAgentWorkflow(request);

    expect(replayed.status).toBe("succeeded");
    expect(run).toHaveBeenCalledTimes(1);
    expect(dispatchEventMock).not.toHaveBeenCalled();
  });
});
