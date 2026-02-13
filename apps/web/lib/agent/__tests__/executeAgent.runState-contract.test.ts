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
    expect(runState[AGENT_RUN_STATE_KEYS.status]).toBe("succeeded");
    expect(runState[AGENT_RUN_STATE_KEYS.runId]).toBe("run-contract");
    expect(typeof runState[AGENT_RUN_STATE_KEYS.lastUpdatedAt]).toBe("string");
    expect(typeof runState[AGENT_RUN_STATE_KEYS.durationMs]).toBe("number");
    expect(JSON.parse(String(runState[AGENT_RUN_STATE_KEYS.partialOutput]))).toEqual(
      VALID_REPORT,
    );
  });
});
