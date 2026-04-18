import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    run: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@openai/agents", () => ({
  run: vi.fn(),
  user: vi.fn((value: unknown) => value),
  assistant: vi.fn((value: unknown) => value),
}));

vi.mock("@entitlement-os/openai", () => ({
  inferQueryIntentFromText: vi.fn(() => "analysis"),
  inferQueryIntentFromDealContext: vi.fn(() => null),
  createConfiguredCoordinator: vi.fn(() => ({ id: "coordinator-agent" })),
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
    snapshot: vi.fn(() => []),
  })),
  extractUsageSummary: vi.fn(() => null),
  isAgentOsFeatureEnabled: vi.fn(() => false),
  maybeTrimToolOutput: vi.fn((value: unknown) => ({ value, wasTrimmed: false })),
  runCriticEvaluation: vi.fn(async () => {}),
  WEB_ADDITIONAL_TOOL_ALLOWLIST: [],
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
      subjectId: "run-contract",
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
vi.mock("../toolRegistry", () => ({
  toolRegistry: {
    search_parcels: vi.fn(),
  },
}));

import {
  AGENT_RUN_STATE_KEYS,
  AGENT_RUN_STATE_SCHEMA_VERSION,
  AGENT_RUN_STATE_STATUS,
} from "@entitlement-os/shared";
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

const SOURCE_RUN_ID = "run-contract";
const NORMALIZED_RUN_ID = toDatabaseRunId(SOURCE_RUN_ID);

function makeAsyncEventStream(events: unknown[]): AsyncIterable<unknown> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const event of events) {
        yield event;
      }
    },
  };
}

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

function getPersistedRunUpdateCalls(updateMock: ReturnType<typeof vi.fn>) {
  return updateMock.mock.calls
    .map(([call]) => call as { data?: Record<string, unknown> })
    .filter((call) => isRecord(call.data) && "outputJson" in call.data);
}

describe("executeAgentWorkflow", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.OPENAI_API_KEY = "test-key";

    const openAiRuntime = (await vi.importMock("@entitlement-os/openai")) as {
      inferQueryIntentFromText: ReturnType<typeof vi.fn>;
      inferQueryIntentFromDealContext: ReturnType<typeof vi.fn>;
      createConfiguredCoordinator: ReturnType<typeof vi.fn>;
    };
    const dealReader = (await vi.importMock("@/lib/services/deal-reader")) as {
      getDealReaderById: ReturnType<typeof vi.fn>;
    };

    dealReader.getDealReaderById.mockResolvedValue(null);
    openAiRuntime.inferQueryIntentFromDealContext.mockReturnValue(null);
    openAiRuntime.inferQueryIntentFromText.mockReturnValue("analysis");
    openAiRuntime.createConfiguredCoordinator.mockReturnValue({ id: "coordinator-agent" });
  });

  it("routes by deal strategy and opportunity kind before falling back to text intent", async () => {
    const { prisma } = await vi.importMock("@entitlement-os/db");
    const openAiAgents = await vi.importMock("@openai/agents");
    const openAiRuntime = await vi.importMock("@entitlement-os/openai");
    const dealReader = await vi.importMock("@/lib/services/deal-reader");
    const { run } = openAiAgents as {
      run: ReturnType<typeof vi.fn>;
      user: ReturnType<typeof vi.fn>;
      assistant: ReturnType<typeof vi.fn>;
    };

    prisma.run.findFirst.mockResolvedValue(null);
    prisma.run.upsert.mockResolvedValue({
      id: NORMALIZED_RUN_ID,
      status: "running",
      inputHash: "input-hash",
      outputJson: null,
      openaiResponseId: null,
      startedAt: new Date("2025-01-01T00:00:00.000Z"),
      finishedAt: null,
    });
    prisma.run.update.mockResolvedValue({ status: "succeeded" });
    dealReader.getDealReaderById.mockResolvedValue({
      id: "deal-asset",
      orgId: "org-test",
      strategy: "VALUE_ADD_ACQUISITION",
      opportunityKind: "PROPERTY",
    });
    openAiRuntime.inferQueryIntentFromDealContext.mockReturnValue("asset_management");
    openAiRuntime.inferQueryIntentFromText.mockReturnValue("analysis");
    run.mockResolvedValue({
      finalOutput: JSON.stringify(VALID_REPORT),
      lastResponseId: "openai-response-id",
    });

    await executeAgentWorkflow({
      orgId: "org-test",
      userId: "user-test",
      conversationId: "conversation-test",
      runId: SOURCE_RUN_ID,
      dealId: "deal-asset",
      input: [{ role: "user", content: "What should we do next on this asset?" }],
      runType: "ENRICHMENT",
    });

    expect(dealReader.getDealReaderById).toHaveBeenCalledWith("org-test", "deal-asset");
    expect(openAiRuntime.inferQueryIntentFromDealContext).toHaveBeenCalledWith(
      expect.objectContaining({
        strategy: "VALUE_ADD_ACQUISITION",
        opportunityKind: "PROPERTY",
      }),
    );
    expect(openAiRuntime.createConfiguredCoordinator).toHaveBeenCalledWith({ intent: "asset_management" });
  });

  it("persists AgentRunOutputJson with required runState contract fields", async () => {
    const { prisma } = await vi.importMock("@entitlement-os/db");
    const openAiAgents = await vi.importMock("@openai/agents");
    const { run } = openAiAgents as {
      run: ReturnType<typeof vi.fn>;
      user: ReturnType<typeof vi.fn>;
      assistant: ReturnType<typeof vi.fn>;
    };

    prisma.run.findFirst.mockResolvedValue(null);
    prisma.run.upsert.mockResolvedValue({
      id: NORMALIZED_RUN_ID,
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
      runId: SOURCE_RUN_ID,
      input: [{ role: "user", content: "Run entitlement analysis" }],
      runType: "ENRICHMENT",
      correlationId: "corr-local",
    });

    expect(prisma.run.update.mock.calls.length).toBeGreaterThanOrEqual(1);
    const updateCall = prisma.run.update.mock.calls[0][0];
    const outputJson = updateCall.data.outputJson as Record<string, unknown>;
    const runState = outputJson.runState as Record<string, unknown>;

    expect(outputJson[AGENT_RUN_STATE_KEYS.partialOutput]).toBeUndefined();
    expect(runState).toMatchObject({
      schemaVersion: AGENT_RUN_STATE_SCHEMA_VERSION,
      runId: NORMALIZED_RUN_ID,
      status: AGENT_RUN_STATE_STATUS.SUCCEEDED,
    });
    expect(runState[AGENT_RUN_STATE_KEYS.correlationId]).toBe("corr-local");
    expect(runState[AGENT_RUN_STATE_KEYS.status]).toBe("succeeded");
    expect(runState[AGENT_RUN_STATE_KEYS.runId]).toBe(NORMALIZED_RUN_ID);
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
      subjectId: NORMALIZED_RUN_ID,
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

  it("accepts markdown-fenced JSON final output without fallback warning", async () => {
    const { prisma } = await vi.importMock("@entitlement-os/db");
    const openAiAgents = await vi.importMock("@openai/agents");
    const openAiRuntime = await vi.importMock("@entitlement-os/openai");
    const { run } = openAiAgents as {
      run: ReturnType<typeof vi.fn>;
      user: ReturnType<typeof vi.fn>;
      assistant: ReturnType<typeof vi.fn>;
    };
    const { captureAgentWarning } = openAiRuntime as {
      captureAgentWarning: ReturnType<typeof vi.fn>;
    };

    prisma.run.findFirst.mockResolvedValue(null);
    prisma.run.upsert.mockResolvedValue({
      id: NORMALIZED_RUN_ID,
      status: "running",
      inputHash: "input-hash",
      outputJson: null,
      openaiResponseId: null,
      startedAt: new Date("2025-01-01T00:00:00.000Z"),
      finishedAt: null,
    });
    (run as ReturnType<typeof vi.fn>).mockResolvedValue({
      finalOutput: `Final normalized report:\n\`\`\`json\n${JSON.stringify(VALID_REPORT, null, 2)}\n\`\`\``,
      lastResponseId: "openai-response-id",
    });
    prisma.run.update.mockResolvedValue({ status: "succeeded" });

    await executeAgentWorkflow({
      orgId: "org-test",
      userId: "user-test",
      conversationId: "conversation-test",
      runId: SOURCE_RUN_ID,
      input: [{ role: "user", content: "Run entitlement analysis" }],
      runType: "ENRICHMENT",
      correlationId: "corr-local",
    });

    expect(prisma.run.update.mock.calls.length).toBeGreaterThanOrEqual(1);
    const updateCall = prisma.run.update.mock.calls[0][0];
    const outputJson = updateCall.data.outputJson as Record<string, unknown>;

    expect(outputJson.finalReport).toEqual(VALID_REPORT);
    expect(JSON.parse(String(outputJson.finalOutput))).toEqual(VALID_REPORT);
    expect(captureAgentWarning).not.toHaveBeenCalled();
  });

  it("normalizes plain-text final output without emitting a Sentry warning", async () => {
    const { prisma } = await vi.importMock("@entitlement-os/db");
    const openAiAgents = await vi.importMock("@openai/agents");
    const openAiRuntime = await vi.importMock("@entitlement-os/openai");
    const { run } = openAiAgents as {
      run: ReturnType<typeof vi.fn>;
      user: ReturnType<typeof vi.fn>;
      assistant: ReturnType<typeof vi.fn>;
    };
    const { captureAgentWarning } = openAiRuntime as {
      captureAgentWarning: ReturnType<typeof vi.fn>;
    };

    prisma.run.findFirst.mockResolvedValue(null);
    prisma.run.upsert.mockResolvedValue({
      id: NORMALIZED_RUN_ID,
      status: "running",
      inputHash: "input-hash",
      outputJson: null,
      openaiResponseId: null,
      startedAt: new Date("2025-01-01T00:00:00.000Z"),
      finishedAt: null,
    });
    (run as ReturnType<typeof vi.fn>).mockResolvedValue({
      finalOutput: "Task Understanding: Evaluate entitlement feasibility for this parcel.",
      lastResponseId: "openai-response-id",
    });
    prisma.run.update.mockResolvedValue({ status: "succeeded" });

    await executeAgentWorkflow({
      orgId: "org-test",
      userId: "user-test",
      conversationId: "conversation-test",
      runId: SOURCE_RUN_ID,
      input: [{ role: "user", content: "Run entitlement analysis" }],
      runType: "ENRICHMENT",
      correlationId: "corr-local",
    });

    expect(prisma.run.update.mock.calls.length).toBeGreaterThanOrEqual(1);
    const updateCall = prisma.run.update.mock.calls[0][0];
    const outputJson = updateCall.data.outputJson as Record<string, unknown>;
    const finalReport = outputJson.finalReport as Record<string, unknown>;

    expect(finalReport.schema_version).toBe("1.0");
    expect(captureAgentWarning).not.toHaveBeenCalled();
    expect(JSON.parse(String(outputJson.finalOutput))).toEqual(finalReport);
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
      prisma.run.findFirst.mockResolvedValue(null);
      prisma.run.upsert.mockResolvedValue({
        id: NORMALIZED_RUN_ID,
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
        runId: SOURCE_RUN_ID,
        input: [{ role: "user", content: "Run entitlement analysis" }],
        runType: "ENRICHMENT",
        correlationId: "corr-local",
      };

      await executeAgentWorkflow(request);
      await executeAgentWorkflow(request);

      const persistedUpdates = getPersistedRunUpdateCalls(prisma.run.update);
      const firstOutput = normalizePersistedOutput(
        persistedUpdates[0]?.data?.outputJson as Record<string, unknown>,
      );
      const secondOutput = normalizePersistedOutput(
        persistedUpdates[1]?.data?.outputJson as Record<string, unknown>,
      );

      expect(firstOutput).toEqual(secondOutput);
    } finally {
      vi.useRealTimers();
    }
  });

  it("retries with a memory reminder when property-fact input has no store_memory calls", async () => {
    const { prisma } = await vi.importMock("@entitlement-os/db");
    const openAiAgents = await vi.importMock("@openai/agents");
    const { run } = openAiAgents as {
      run: ReturnType<typeof vi.fn>;
      user: ReturnType<typeof vi.fn>;
      assistant: ReturnType<typeof vi.fn>;
    };

    prisma.run.findFirst.mockResolvedValue(null);
    prisma.run.upsert.mockResolvedValue({
      id: NORMALIZED_RUN_ID,
      status: "running",
      inputHash: "input-hash",
      outputJson: null,
      openaiResponseId: null,
      startedAt: new Date("2025-01-01T00:00:00.000Z"),
      finishedAt: null,
    });
    (run as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      finalOutput: JSON.stringify(VALID_REPORT),
      lastResponseId: "openai-response-id",
    });
    (run as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      finalOutput: JSON.stringify(VALID_REPORT),
      lastResponseId: "openai-response-id-reminder",
    });
    prisma.run.update.mockResolvedValue({ status: "succeeded" });

    await executeAgentWorkflow({
      orgId: "org-test",
      userId: "user-test",
      conversationId: "conversation-test",
      runId: SOURCE_RUN_ID,
      input: [{ role: "user", content: "Here are comps for 123 Main St: $1.2M sale." }],
      runType: "ENRICHMENT",
      correlationId: "corr-local",
    });

    expect(run).toHaveBeenCalledTimes(2);
    expect(
      (run as ReturnType<typeof vi.fn>).mock.calls[1]?.[1],
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining("You were provided property data"),
      ]),
    );

    const updateCall = prisma.run.update.mock.calls[0][0];
    const outputJson = updateCall.data.outputJson as Record<string, unknown>;
    expect(outputJson.toolFailures).toEqual(
      expect.arrayContaining([
        expect.stringContaining("runtime_memory_enforcement"),
      ]),
    );
    expect(outputJson.evidenceRetryPolicy).toEqual(
      expect.objectContaining({
        enabled: true,
        missingEvidenceCount: 1,
      }),
    );
  });

  it("does not retry when store_memory is called during the first attempt", async () => {
    const { prisma } = await vi.importMock("@entitlement-os/db");
    const openAiAgents = await vi.importMock("@openai/agents");
    const { run } = openAiAgents as {
      run: ReturnType<typeof vi.fn>;
      user: ReturnType<typeof vi.fn>;
      assistant: ReturnType<typeof vi.fn>;
    };

    prisma.run.findFirst.mockResolvedValue(null);
    prisma.run.upsert.mockResolvedValue({
      id: NORMALIZED_RUN_ID,
      status: "running",
      inputHash: "input-hash",
      outputJson: null,
      openaiResponseId: null,
      startedAt: new Date("2025-01-01T00:00:00.000Z"),
      finishedAt: null,
    });
    (run as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeAsyncEventStream([
        {
          type: "raw_model_stream_event",
          data: { delta: JSON.stringify(VALID_REPORT) },
        },
        {
          type: "run_item_stream_event",
          item: {
            type: "tool_called",
            name: "tool_called",
            raw_item: {
              type: "function_call",
              name: "store_memory",
              arguments: JSON.stringify({
                input_text: "123 Main St sold for $800K.",
              }),
              call_id: "call-store-memory",
            },
          },
        },
        {
          type: "run_item_stream_event",
          item: {
            type: "tool_output",
            name: "tool_output",
            output: { stored: true },
            raw_item: {
              type: "function_call_output",
              name: "store_memory",
              call_id: "call-store-memory",
            },
          },
        },
      ]),
    );
    prisma.run.update.mockResolvedValue({ status: "succeeded" });

    await executeAgentWorkflow({
      orgId: "org-test",
      userId: "user-test",
      conversationId: "conversation-test",
      runId: SOURCE_RUN_ID,
      input: [{ role: "user", content: "Here are 3 comps for 123 Main St: $800K sale." }],
      runType: "ENRICHMENT",
      correlationId: "corr-local",
    });

    expect(run).toHaveBeenCalledTimes(1);

    const updateCall = prisma.run.update.mock.calls[0][0];
    const outputJson = updateCall.data.outputJson as Record<string, unknown>;
    expect(outputJson.toolFailures).not.toEqual(
      expect.arrayContaining([expect.stringContaining("runtime_memory_enforcement")]),
    );
    expect(
      Array.isArray(outputJson.toolFailures) ? outputJson.toolFailures.length : undefined,
    ).toBe(0);
    expect(outputJson.evidenceRetryPolicy).toEqual(
      expect.objectContaining({
        enabled: false,
        missingEvidenceCount: 0,
      }),
    );
  });

  it("skips proof enforcement for explicit memory-ingestion requests once store_memory succeeds", async () => {
    const { prisma } = await vi.importMock("@entitlement-os/db");
    const openAiAgents = await vi.importMock("@openai/agents");
    const openAiRuntime = await vi.importMock("@entitlement-os/openai");
    const { run } = openAiAgents as {
      run: ReturnType<typeof vi.fn>;
      user: ReturnType<typeof vi.fn>;
      assistant: ReturnType<typeof vi.fn>;
    };

    prisma.run.findFirst.mockResolvedValue(null);
    prisma.run.upsert.mockResolvedValue({
      id: NORMALIZED_RUN_ID,
      status: "running",
      inputHash: "input-hash",
      outputJson: null,
      openaiResponseId: null,
      startedAt: new Date("2025-01-01T00:00:00.000Z"),
      finishedAt: null,
    });
    openAiRuntime.getProofGroupsForIntent.mockReturnValue([
      { label: "Parcel Proof", tools: ["search_parcels"] },
    ]);
    openAiRuntime.evaluateProofCompliance.mockReturnValue([
      {
        group: { label: "Parcel Proof", tools: ["search_parcels"] },
        missingTools: ["search_parcels"],
      },
    ]);
    (run as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeAsyncEventStream([
        {
          type: "raw_model_stream_event",
          data: {
            delta:
              "Stored and verified the property fact for future recall: 123 Memory Ln sold for $800,000.",
          },
        },
        {
          type: "run_item_stream_event",
          item: {
            type: "tool_called",
            name: "tool_called",
            raw_item: {
              type: "function_call",
              name: "store_memory",
              arguments: JSON.stringify({
                input_text:
                  "Store this property fact for future recall: 123 Memory Ln sold for $800,000.",
              }),
              call_id: "call-store-memory-proof-skip",
            },
          },
        },
        {
          type: "run_item_stream_event",
          item: {
            type: "tool_output",
            name: "tool_output",
            output: { stored: true },
            raw_item: {
              type: "function_call_output",
              name: "store_memory",
              call_id: "call-store-memory-proof-skip",
            },
          },
        },
      ]),
    );
    prisma.run.update.mockResolvedValue({ status: "succeeded" });

    const result = await executeAgentWorkflow({
      orgId: "org-test",
      userId: "user-test",
      conversationId: "conversation-test",
      runId: SOURCE_RUN_ID,
      input: [
        {
          role: "user",
          content:
            "Store this property fact for future recall: 123 Memory Ln sold for $800,000 on 2025-01-01.",
        },
      ],
      runType: "ENRICHMENT",
      correlationId: "corr-proof-skip",
    });

    expect(result.status).toBe("succeeded");

    const updateCall = prisma.run.update.mock.calls[0][0];
    const outputJson = updateCall.data.outputJson as Record<string, unknown>;
    expect(outputJson.toolFailures).not.toEqual(
      expect.arrayContaining([expect.stringContaining("proof_enforcement")]),
    );
    expect(outputJson.proofChecks).toEqual(
      expect.arrayContaining(["Parcel Proof:skipped-ingestion"]),
    );
  });

  it("preserves plain-text knowledge-ingestion confirmations without fallback normalization", async () => {
    const { prisma } = await vi.importMock("@entitlement-os/db");
    const openAiAgents = await vi.importMock("@openai/agents");
    const openAiRuntime = await vi.importMock("@entitlement-os/openai");
    const loggerModule = await vi.importMock("../loggerAdapter");
    const { run } = openAiAgents as {
      run: ReturnType<typeof vi.fn>;
      user: ReturnType<typeof vi.fn>;
      assistant: ReturnType<typeof vi.fn>;
    };

    prisma.run.findFirst.mockResolvedValue(null);
    prisma.run.upsert.mockResolvedValue({
      id: NORMALIZED_RUN_ID,
      status: "running",
      inputHash: "input-hash",
      outputJson: null,
      openaiResponseId: null,
      startedAt: new Date("2025-01-01T00:00:00.000Z"),
      finishedAt: null,
    });
    openAiRuntime.getProofGroupsForIntent.mockReturnValue([
      { label: "Parcel Proof", tools: ["search_parcels"] },
    ]);
    openAiRuntime.evaluateProofCompliance.mockReturnValue([
      {
        group: { label: "Parcel Proof", tools: ["search_parcels"] },
        missingTools: ["search_parcels"],
      },
    ]);
    (run as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeAsyncEventStream([
        {
          type: "raw_model_stream_event",
          data: {
            delta:
              "Stored the underwriting pattern in the knowledge base for future reference.",
          },
        },
        {
          type: "run_item_stream_event",
          item: {
            type: "tool_called",
            name: "tool_called",
            raw_item: {
              type: "function_call",
              name: "store_knowledge_entry",
              arguments: JSON.stringify({
                title: "Industrial flex rent growth pattern",
              }),
              call_id: "call-store-knowledge-entry",
            },
          },
        },
        {
          type: "run_item_stream_event",
          item: {
            type: "tool_output",
            name: "tool_output",
            output: { stored: true },
            raw_item: {
              type: "function_call_output",
              name: "store_knowledge_entry",
              call_id: "call-store-knowledge-entry",
            },
          },
        },
      ]),
    );
    prisma.run.update.mockResolvedValue({ status: "succeeded" });

    const result = await executeAgentWorkflow({
      orgId: "org-test",
      userId: "user-test",
      conversationId: "conversation-test",
      runId: SOURCE_RUN_ID,
      input: [
        {
          role: "user",
          content:
            "Store this underwriting pattern in the knowledge base for future reference: industrial flex rents in Baton Rouge hold better when dock-high access is present.",
        },
      ],
      runType: "ENRICHMENT",
      correlationId: "corr-knowledge-ingest",
    });

    expect(result.status).toBe("succeeded");
    expect(result.finalOutput).toBe(
      "Stored the underwriting pattern in the knowledge base for future reference.",
    );
    expect(result.finalReport).toBeNull();

    const updateCall = prisma.run.update.mock.calls[0][0];
    const outputJson = updateCall.data.outputJson as Record<string, unknown>;
    expect(outputJson.finalOutput).toBe(
      "Stored the underwriting pattern in the knowledge base for future reference.",
    );
    expect(outputJson.finalReport).toBeNull();
    expect(outputJson.proofChecks).toEqual(
      expect.arrayContaining(["Parcel Proof:skipped-ingestion"]),
    );
    expect(outputJson.toolFailures).not.toEqual(
      expect.arrayContaining([expect.stringContaining("final_report")]),
    );
    expect((loggerModule.logger.warn as ReturnType<typeof vi.fn>)).not.toHaveBeenCalledWith(
      "Agent final output was non-JSON; applied fallback report normalization",
      expect.anything(),
    );
  });

  it("preserves plain-text address recall replies after lookup without fallback normalization", async () => {
    const { prisma } = await vi.importMock("@entitlement-os/db");
    const openAiAgents = await vi.importMock("@openai/agents");
    const openAiRuntime = await vi.importMock("@entitlement-os/openai");
    const { run } = openAiAgents as {
      run: ReturnType<typeof vi.fn>;
      user: ReturnType<typeof vi.fn>;
      assistant: ReturnType<typeof vi.fn>;
    };
    const loggerModule = await vi.importMock("../loggerAdapter");
    const reply = "$2,345,678";

    openAiRuntime.getProofGroupsForIntent.mockReturnValue([]);
    openAiRuntime.evaluateProofCompliance.mockReturnValue([]);

    prisma.run.findFirst.mockResolvedValue(null);
    prisma.run.upsert.mockResolvedValue({
      id: NORMALIZED_RUN_ID,
      status: "running",
      inputHash: "input-hash",
      outputJson: null,
      openaiResponseId: null,
      startedAt: new Date("2025-01-01T00:00:00.000Z"),
      finishedAt: null,
    });
    (run as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeAsyncEventStream([
        {
          type: "run_item_stream_event",
          item: {
            type: "tool_called",
            name: "tool_called",
            raw_item: {
              type: "function_call",
              name: "lookup_entity_by_address",
              arguments: JSON.stringify({
                address: "1010 Trace Memory Ave, Baton Rouge, LA 70808",
              }),
              call_id: "call-lookup-entity",
            },
          },
        },
        {
          type: "run_item_stream_event",
          item: {
            type: "tool_output",
            name: "tool_output",
            output: {
              found: true,
              entity_id: "entity-lookup",
              address: "1010 Trace Memory Ave, Baton Rouge, LA 70808",
            },
            raw_item: {
              type: "function_call_output",
              name: "lookup_entity_by_address",
              call_id: "call-lookup-entity",
            },
          },
        },
        {
          type: "raw_model_stream_event",
          data: { delta: reply },
        },
      ]),
    );
    prisma.run.update.mockResolvedValue({ status: "succeeded" });

    const result = await executeAgentWorkflow({
      orgId: "org-test",
      userId: "user-test",
      conversationId: "conversation-test",
      runId: SOURCE_RUN_ID,
      input: [
        {
          role: "user",
          content: "What do we know about 1010 Trace Memory Ave, Baton Rouge, LA 70808?",
        },
      ],
      runType: "ENRICHMENT",
      correlationId: "corr-recall-plain-text",
    });

    expect(result.status).toBe("succeeded");
    expect(result.finalOutput).toBe(reply);
    expect(result.finalReport).toBeNull();

    const updateCall = prisma.run.update.mock.calls[0][0];
    const outputJson = updateCall.data.outputJson as Record<string, unknown>;
    expect(outputJson.finalOutput).toBe(reply);
    expect(outputJson.finalReport).toBeNull();
    expect(outputJson.toolFailures).not.toEqual(
      expect.arrayContaining([expect.stringContaining("final_report")]),
    );
    expect((loggerModule.logger.warn as ReturnType<typeof vi.fn>)).not.toHaveBeenCalledWith(
      "Agent final output was non-JSON; applied fallback report normalization",
      expect.anything(),
    );
  });

  it("preserves plain-text numeric address recall replies after lookup without fallback normalization", async () => {
    const { prisma } = await vi.importMock("@entitlement-os/db");
    const openAiAgents = await vi.importMock("@openai/agents");
    const openAiRuntime = await vi.importMock("@entitlement-os/openai");
    const { run } = openAiAgents as {
      run: ReturnType<typeof vi.fn>;
      user: ReturnType<typeof vi.fn>;
      assistant: ReturnType<typeof vi.fn>;
    };
    const loggerModule = await vi.importMock("../loggerAdapter");
    const reply = "$2,345,678";

    openAiRuntime.getProofGroupsForIntent.mockReturnValue([]);
    openAiRuntime.evaluateProofCompliance.mockReturnValue([]);

    prisma.run.findFirst.mockResolvedValue(null);
    prisma.run.upsert.mockResolvedValue({
      id: NORMALIZED_RUN_ID,
      status: "running",
      inputHash: "input-hash",
      outputJson: null,
      openaiResponseId: null,
      startedAt: new Date("2025-01-01T00:00:00.000Z"),
      finishedAt: null,
    });
    (run as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeAsyncEventStream([
        {
          type: "run_item_stream_event",
          item: {
            type: "tool_called",
            name: "tool_called",
            raw_item: {
              type: "function_call",
              name: "lookup_entity_by_address",
              arguments: JSON.stringify({
                address: "1010 Trace Memory Ave, Baton Rouge, LA 70808",
              }),
              call_id: "call-lookup-entity-numeric",
            },
          },
        },
        {
          type: "run_item_stream_event",
          item: {
            type: "tool_output",
            name: "tool_output",
            output: {
              found: true,
              entity_id: "entity-lookup",
              address: "1010 Trace Memory Ave, Baton Rouge, LA 70808",
            },
            raw_item: {
              type: "function_call_output",
              name: "lookup_entity_by_address",
              call_id: "call-lookup-entity-numeric",
            },
          },
        },
        {
          type: "raw_model_stream_event",
          data: { delta: reply },
        },
      ]),
    );
    prisma.run.update.mockResolvedValue({ status: "succeeded" });

    const result = await executeAgentWorkflow({
      orgId: "org-test",
      userId: "user-test",
      conversationId: "conversation-test",
      runId: SOURCE_RUN_ID,
      input: [
        {
          role: "user",
          content:
            "What was the sale price for 1010 Trace Memory Ave, Baton Rouge, LA 70808? Reply with the number only.",
        },
      ],
      runType: "ENRICHMENT",
      correlationId: "corr-recall-plain-text-numeric",
    });

    expect(result.status).toBe("succeeded");
    expect(result.finalOutput).toBe(reply);
    expect(result.finalReport).toBeNull();

    const updateCall = prisma.run.update.mock.calls[0][0];
    const outputJson = updateCall.data.outputJson as Record<string, unknown>;
    expect(outputJson.finalOutput).toBe(reply);
    expect(outputJson.finalReport).toBeNull();
    expect(outputJson.toolFailures).not.toEqual(
      expect.arrayContaining([expect.stringContaining("final_report")]),
    );
    expect((loggerModule.logger.warn as ReturnType<typeof vi.fn>)).not.toHaveBeenCalledWith(
      "Agent final output was non-JSON; applied fallback report normalization",
      expect.anything(),
    );
  });

  it("suppresses retrieval-context schema drift warnings in local runtimes", async () => {
    const { prisma } = await vi.importMock("@entitlement-os/db");
    const openAiAgents = await vi.importMock("@openai/agents");
    const retrievalAdapter = await vi.importMock("../retrievalAdapter");
    const loggerModule = await vi.importMock("../loggerAdapter");
    const { run } = openAiAgents as {
      run: ReturnType<typeof vi.fn>;
      user: ReturnType<typeof vi.fn>;
      assistant: ReturnType<typeof vi.fn>;
    };

    prisma.run.findFirst.mockResolvedValue(null);
    prisma.run.upsert.mockResolvedValue({
      id: NORMALIZED_RUN_ID,
      status: "running",
      inputHash: "input-hash",
      outputJson: null,
      openaiResponseId: null,
      startedAt: new Date("2025-01-01T00:00:00.000Z"),
      finishedAt: null,
    });
    prisma.run.update.mockResolvedValue({ status: "succeeded" });
    (retrievalAdapter.unifiedRetrieval as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('relation "KGEvent" does not exist'),
    );
    run.mockResolvedValue({
      finalOutput: JSON.stringify(VALID_REPORT),
      lastResponseId: "openai-response-id",
    });

    const result = await executeAgentWorkflow({
      orgId: "org-test",
      userId: "user-test",
      conversationId: "conversation-test",
      runId: SOURCE_RUN_ID,
      input: [{ role: "user", content: "Summarize this opportunity." }],
      runType: "ENRICHMENT",
      correlationId: "corr-schema-drift-retrieval",
    });

    expect(result.status).toBe("succeeded");
    expect((loggerModule.logger.info as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      "Skipped retrieval context computation due to local schema drift",
      expect.objectContaining({
        runId: NORMALIZED_RUN_ID,
      }),
    );
    expect((loggerModule.logger.warn as ReturnType<typeof vi.fn>)).not.toHaveBeenCalledWith(
      "Failed to compute retrieval context for run",
      expect.anything(),
    );
  });

  it("retries with a conflict reminder when store_memory returns draft conflict without confirmation text", async () => {
    const { prisma } = await vi.importMock("@entitlement-os/db");
    const openAiAgents = await vi.importMock("@openai/agents");
    const { run } = openAiAgents as {
      run: ReturnType<typeof vi.fn>;
      user: ReturnType<typeof vi.fn>;
      assistant: ReturnType<typeof vi.fn>;
    };
    const enforcedReply =
      "I found a conflict with prior stored data for this address. Please confirm which sale price is correct. I stored the new claim as draft pending your confirmation.";
    const events: Array<{ type: string; content?: string }> = [];

    prisma.run.findFirst.mockResolvedValue(null);
    prisma.run.upsert.mockResolvedValue({
      id: NORMALIZED_RUN_ID,
      status: "running",
      inputHash: "input-hash",
      outputJson: null,
      openaiResponseId: null,
      startedAt: new Date("2025-01-01T00:00:00.000Z"),
      finishedAt: null,
    });
    (run as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeAsyncEventStream([
        {
          type: "raw_model_stream_event",
          data: { delta: "Thanks, got it." },
        },
        {
          type: "run_item_stream_event",
          item: {
            type: "tool_result",
            name: "store_memory",
            output: {
              stored: true,
              decision: "draft",
              reasons: ["Conflict detected on keys: sale_price"],
              structuredMemoryWrite: {
                entity_id: "ef0ebf0c-ceee-4b92-86b4-07db6f6bef63",
                payload: { sale_date: "2026-02-23", sale_price: 3000000 },
              },
            },
          },
        },
      ]),
    );
    (run as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      finalOutput: enforcedReply,
      lastResponseId: "openai-response-id-reminder",
    });
    prisma.run.update.mockResolvedValue({ status: "succeeded" });

    await executeAgentWorkflow({
      orgId: "org-test",
      userId: "user-test",
      conversationId: "conversation-test",
      runId: SOURCE_RUN_ID,
      input: [{ role: "user", content: "6150 Hwy 73 sold for $3,000,000 on 2/23/26." }],
      runType: "ENRICHMENT",
      correlationId: "corr-local",
      onEvent: (event) => {
        if (event.type === "text_delta") {
          events.push({ type: event.type, content: event.content });
        }
      },
    });

    expect(run).toHaveBeenCalledTimes(2);
    expect((run as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]).toEqual(
      expect.arrayContaining([expect.stringContaining("Runtime Clock Context (authoritative)")]),
    );
    expect((run as ReturnType<typeof vi.fn>).mock.calls[1]?.[1]).toEqual(
      expect.arrayContaining([
        expect.stringContaining("stored memory as draft because of a conflict"),
      ]),
    );
    expect(events.map((event) => event.content).join(" ")).toContain(enforcedReply);
    expect(events.map((event) => event.content).join(" ")).not.toContain("Thanks, got it.");
  });

  it("retries with an address-memory reminder when address recall input has no memory lookup calls", async () => {
    const { prisma } = await vi.importMock("@entitlement-os/db");
    const openAiAgents = await vi.importMock("@openai/agents");
    const { run } = openAiAgents as {
      run: ReturnType<typeof vi.fn>;
      user: ReturnType<typeof vi.fn>;
      assistant: ReturnType<typeof vi.fn>;
    };

    prisma.run.findFirst.mockResolvedValue(null);
    prisma.run.upsert.mockResolvedValue({
      id: NORMALIZED_RUN_ID,
      status: "running",
      inputHash: "input-hash",
      outputJson: null,
      openaiResponseId: null,
      startedAt: new Date("2025-01-01T00:00:00.000Z"),
      finishedAt: null,
    });
    (run as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      finalOutput: JSON.stringify(VALID_REPORT),
      lastResponseId: "openai-response-id-primary",
    });
    (run as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      finalOutput: JSON.stringify(VALID_REPORT),
      lastResponseId: "openai-response-id-reminder",
    });
    prisma.run.update.mockResolvedValue({ status: "succeeded" });

    await executeAgentWorkflow({
      orgId: "org-test",
      userId: "user-test",
      conversationId: "conversation-test",
      runId: SOURCE_RUN_ID,
      input: [{ role: "user", content: "Tell me about 10555 Old Hammond Hwy, Baton Rouge, LA 70816." }],
      runType: "ENRICHMENT",
      correlationId: "corr-local",
    });

    expect(run).toHaveBeenCalledTimes(2);
    expect((run as ReturnType<typeof vi.fn>).mock.calls[1]?.[1]).toEqual(
      expect.arrayContaining([
        expect.stringContaining("The user asked about a specific property address"),
      ]),
    );

    const updateCall = prisma.run.update.mock.calls[0][0];
    const outputJson = updateCall.data.outputJson as Record<string, unknown>;
    expect(outputJson.toolFailures).toEqual(
      expect.arrayContaining([expect.stringContaining("runtime_memory_lookup_enforcement")]),
    );
  });

  it("retries with parcel mismatch guardrail when response substitutes a nearby parcel address", async () => {
    const { prisma } = await vi.importMock("@entitlement-os/db");
    const openAiAgents = await vi.importMock("@openai/agents");
    const { run } = openAiAgents as {
      run: ReturnType<typeof vi.fn>;
      user: ReturnType<typeof vi.fn>;
      assistant: ReturnType<typeof vi.fn>;
    };
    const enforcedReply =
      "I could not find an exact parcel match for 10555 Old Hammond Hwy, Baton Rouge, LA 70816. " +
      "I will not attribute nearby parcel records to this address. Please confirm the exact parcel_id or address variant.";
    const events: Array<{ type: string; content?: string }> = [];

    prisma.run.findFirst.mockResolvedValue(null);
    prisma.run.upsert.mockResolvedValue({
      id: NORMALIZED_RUN_ID,
      status: "running",
      inputHash: "input-hash",
      outputJson: null,
      openaiResponseId: null,
      startedAt: new Date("2025-01-01T00:00:00.000Z"),
      finishedAt: null,
    });
    (run as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeAsyncEventStream([
        {
          type: "raw_model_stream_event",
          data: { delta: "The closest adjacent parcel is 10202 Jefferson Hwy." },
        },
        {
          type: "run_item_stream_event",
          item: {
            type: "tool_result",
            name: "get_entity_truth",
            output: { truth: {} },
          },
        },
        {
          type: "run_item_stream_event",
          item: {
            type: "tool_result",
            name: "search_parcels",
            arguments: { search_text: "10555 Old Hammond Hwy, Baton Rouge, LA 70816" },
            output: {
              ok: true,
              parcels: [
                {
                  address: "10202 Jefferson Hwy, Ste B-2",
                },
              ],
            },
          },
        },
      ]),
    );
    (run as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      finalOutput: enforcedReply,
      lastResponseId: "openai-response-id-reminder",
    });
    prisma.run.update.mockResolvedValue({ status: "succeeded" });

    await executeAgentWorkflow({
      orgId: "org-test",
      userId: "user-test",
      conversationId: "conversation-test",
      runId: SOURCE_RUN_ID,
      input: [{ role: "user", content: "Tell me about 10555 Old Hammond Hwy, Baton Rouge, LA 70816." }],
      runType: "ENRICHMENT",
      correlationId: "corr-local",
      onEvent: (event) => {
        if (event.type === "text_delta") {
          events.push({ type: event.type, content: event.content });
        }
      },
    });

    expect(run).toHaveBeenCalledTimes(2);
    expect((run as ReturnType<typeof vi.fn>).mock.calls[1]?.[1]).toEqual(
      expect.arrayContaining([
        expect.stringContaining("A parcel search returned a non-exact address match"),
      ]),
    );
    expect(events.map((event) => event.content).join(" ")).toContain(enforcedReply);
    expect(events.map((event) => event.content).join(" ")).not.toContain("closest adjacent parcel");
  });

  it("falls back to parcel search when memory lookup misses an exact address", async () => {
    const { prisma } = await vi.importMock("@entitlement-os/db");
    const openAiAgents = await vi.importMock("@openai/agents");
    const { toolRegistry } = await vi.importMock("../toolRegistry");
    const { run } = openAiAgents as {
      run: ReturnType<typeof vi.fn>;
      user: ReturnType<typeof vi.fn>;
      assistant: ReturnType<typeof vi.fn>;
    };
    const searchParcelsMock = toolRegistry.search_parcels as ReturnType<typeof vi.fn>;
    const requestedAddress = "3154 College Drive, Baton Rouge, LA 70808";

    prisma.run.findFirst.mockResolvedValue(null);
    prisma.run.upsert.mockResolvedValue({
      id: NORMALIZED_RUN_ID,
      status: "running",
      inputHash: "input-hash",
      outputJson: null,
      openaiResponseId: null,
      startedAt: new Date("2025-01-01T00:00:00.000Z"),
      finishedAt: null,
    });
    (run as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeAsyncEventStream([
        {
          type: "run_item_stream_event",
          item: {
            type: "tool_called",
            name: "tool_called",
            raw_item: {
              type: "function_call",
              name: "lookup_entity_by_address",
              arguments: JSON.stringify({ address: requestedAddress }),
              call_id: "call-lookup-miss",
            },
          },
        },
        {
          type: "run_item_stream_event",
          item: {
            type: "tool_output",
            name: "tool_output",
            output: { found: false },
            raw_item: {
              type: "function_call_output",
              name: "lookup_entity_by_address",
              call_id: "call-lookup-miss",
            },
          },
        },
        {
          type: "raw_model_stream_event",
          data: { delta: `${requestedAddress} is not on file.` },
        },
      ]),
    );
    searchParcelsMock.mockResolvedValue({
      parcels: [
        {
          parcel_id: "007-3915-4",
          address: requestedAddress,
          owner: "3154 College Drive LLC",
          zoning: "C2",
          acreage: 1.17,
          floodZone: "X",
        },
      ],
    });
    prisma.run.update.mockResolvedValue({ status: "succeeded" });

    const result = await executeAgentWorkflow({
      orgId: "org-test",
      userId: "user-test",
      conversationId: "conversation-test",
      runId: SOURCE_RUN_ID,
      input: [{ role: "user", content: `Tell me about ${requestedAddress}.` }],
      runType: "ENRICHMENT",
      correlationId: "corr-address-parcel-fallback",
    });

    expect(searchParcelsMock).toHaveBeenCalledWith(
      { search_text: requestedAddress, limit_rows: 5 },
      expect.objectContaining({
        orgId: "org-test",
        userId: "user-test",
        conversationId: "conversation-test",
        runId: NORMALIZED_RUN_ID,
      }),
    );
    expect(result.status).toBe("succeeded");
    expect(result.finalOutput).toContain("does not have saved property intelligence yet");
    expect(result.finalOutput).toContain("Parcel database match");
    expect(result.finalOutput).toContain("007-3915-4");
    expect(result.finalOutput).toContain("3154 College Drive LLC");

    const updateCall = prisma.run.update.mock.calls[0][0];
    const outputJson = updateCall.data.outputJson as Record<string, unknown>;
    expect(outputJson.toolsInvoked).toEqual(
      expect.arrayContaining(["lookup_entity_by_address", "search_parcels"]),
    );
  });
});
