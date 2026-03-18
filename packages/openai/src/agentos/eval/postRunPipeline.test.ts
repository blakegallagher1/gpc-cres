import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RunData } from "./trajectoryLogger.js";

function makeRunData(overrides?: Partial<RunData>): RunData {
  return {
    runId: "run-1",
    orgId: "org-1",
    agentId: "coordinator",
    taskInput: "What is the zoning for parcel 12345?",
    finalOutput: "The parcel is zoned C-2 Commercial.",
    status: "succeeded",
    latencyMs: 3200,
    model: "gpt-5.2",
    tokenUsage: { input: 500, output: 200, reasoning: 100, total: 800 },
    toolCalls: [
      {
        toolName: "search_parcels",
        input: { query: "12345" },
        output: { results: [] },
        latencyMs: 450,
        success: true,
        retryCount: 0,
      },
    ],
    intermediateSteps: {},
    retrievedContextSummary: { episodic: 2, domain: 1 },
    plan: "Look up parcel and check zoning.",
    policyAuditEntries: [],
    ...overrides,
  };
}

describe("PostRunPipeline", () => {
  const ENV_KEYS = [
    "AGENTOS_ENABLED",
    "AGENTOS_TRAJECTORY_ENABLED",
    "AGENTOS_REFLECTION_ENABLED",
    "AGENTOS_CRITIC_ENABLED",
    "AGENTOS_SKILL_DISTILLATION_ENABLED",
  ] as const;

  const originalEnv: Partial<Record<string, string>> = {};
  for (const key of ENV_KEYS) {
    originalEnv[key] = process.env[key];
  }

  beforeEach(() => {
    vi.resetModules();
    for (const key of ENV_KEYS) delete process.env[key];
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const original = originalEnv[key];
      if (original === undefined) delete process.env[key];
      else process.env[key] = original;
    }
  });

  it("is a complete no-op when all flags are off", async () => {
    const { PostRunPipeline } = await import("./postRunPipeline.js");

    const mockPrisma = {
      trajectoryLog: { create: vi.fn(), update: vi.fn(), aggregate: vi.fn() },
      run: { update: vi.fn() },
    };

    const pipeline = new PostRunPipeline(
      mockPrisma as unknown as import("@entitlement-os/db").PrismaClient,
      "http://localhost:6333",
    );

    await pipeline.execute(makeRunData());

    expect(mockPrisma.trajectoryLog.create).not.toHaveBeenCalled();
    expect(mockPrisma.run.update).not.toHaveBeenCalled();
  }, 15_000);

  it("captures trajectory when only trajectoryCapture is enabled", async () => {
    process.env.AGENTOS_ENABLED = "true";
    process.env.AGENTOS_TRAJECTORY_ENABLED = "true";

    const { PostRunPipeline } = await import("./postRunPipeline.js");

    const mockPrisma = {
      trajectoryLog: {
        create: vi.fn().mockResolvedValue({ id: "traj-1" }),
        update: vi.fn().mockResolvedValue({}),
        aggregate: vi.fn().mockResolvedValue({ _sum: { costUsd: 0 } }),
      },
      run: {
        update: vi.fn().mockResolvedValue({}),
      },
    };

    const pipeline = new PostRunPipeline(
      mockPrisma as unknown as import("@entitlement-os/db").PrismaClient,
      "http://localhost:6333",
    );

    await pipeline.execute(makeRunData());

    expect(mockPrisma.trajectoryLog.create).toHaveBeenCalledTimes(1);

    const createArg = mockPrisma.trajectoryLog.create.mock.calls[0][0].data;
    expect(createArg.orgId).toBe("org-1");
    expect(createArg.runId).toBe("run-1");
    expect(createArg.agentId).toBe("coordinator");
    expect(createArg.taskInput).toBe("What is the zoning for parcel 12345?");
    expect(createArg.finalOutput).toBe("The parcel is zoned C-2 Commercial.");
    expect(createArg.latencyMs).toBe(3200);
    expect(createArg.costUsd).toBeGreaterThan(0);
  }, 15_000);
});

describe("computeRunCost", () => {
  it("computes cost correctly for gpt-5.2", async () => {
    const { computeRunCost } = await import("./costTracker.js");

    const cost = computeRunCost(
      { input: 1000, output: 500, reasoning: 200, total: 1700 },
      "gpt-5.2",
    );

    const expected = (1000 / 1000) * 0.005 + (500 / 1000) * 0.015 + (200 / 1000) * 0.015;
    expect(cost).toBeCloseTo(expected, 4);
    expect(cost).toBeGreaterThan(0);
  });

  it("uses default pricing for unknown models", async () => {
    const { computeRunCost } = await import("./costTracker.js");

    const cost = computeRunCost(
      { input: 100, output: 50, reasoning: 0, total: 150 },
      "unknown-model",
    );

    expect(cost).toBeGreaterThan(0);
  });
});
