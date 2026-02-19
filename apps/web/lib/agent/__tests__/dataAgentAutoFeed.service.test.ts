import { describe, expect, it, vi, beforeEach } from "vitest";

const { mockQueryRawUnsafe } = vi.hoisted(() => ({
  mockQueryRawUnsafe: vi.fn(),
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    $queryRawUnsafe: mockQueryRawUnsafe,
  },
}));

import { autoFeedRun } from "../dataAgentAutoFeed.service";

const BASE_INPUT = {
  orgId: "org-contract",
  runId: "run-contract",
  runType: "ENRICHMENT",
  agentIntent: "Run entitlement analysis",
  finalOutputText: "analysis complete",
  finalReport: { summary: "ok" },
  confidence: 0.92,
  evidenceHash: "hash-1",
  toolsInvoked: ["coordinator"],
  evidenceCitations: [
    {
      tool: "agent",
      sourceId: "src-1",
      contentHash: "hash-c",
    },
  ],
  retrievalMeta: { source: "test" },
};

describe("apps/web dataAgentAutoFeed", () => {
  beforeEach(() => {
    mockQueryRawUnsafe.mockReset();
    process.env.DATA_AGENT_AUTOFED = "true";
    process.env.NODE_ENV = "production";
  });

  it("rejects malformed auto-feed payloads as validation errors", async () => {
    const result = await autoFeedRun({
      ...BASE_INPUT,
      runId: "",
      evidenceHash: "",
      toolsInvoked: [] as never,
    });

    expect(result.summary).toBe("Auto-feed payload validation failed");
    expect(result.errors).toContain("runId is required");
    expect(mockQueryRawUnsafe).not.toHaveBeenCalled();
  });

  it("creates episode and writes reward/graph rows for a valid payload", async () => {
    mockQueryRawUnsafe
      .mockResolvedValueOnce([]) // episode lookup
      .mockResolvedValueOnce([{ id: "ep-valid" }]) // episode insert
      .mockResolvedValueOnce({ count: 1 }) // embedding insert
      .mockResolvedValueOnce([{ id: "kg-1" }]) // citation event 1
      .mockResolvedValueOnce([{ id: "kg-2" }]) // citation event 2
      .mockResolvedValueOnce({ count: 1 }) // episode update
      .mockResolvedValueOnce({}) ; // reward insert

    const result = await autoFeedRun({
      ...BASE_INPUT,
      finalOutputText: "completed review",
      evidenceCitations: [
        {
          tool: "agent",
          sourceId: "src-1",
          contentHash: "hash-c1",
        },
        {
          tool: "worker",
          sourceId: "src-2",
          contentHash: "hash-c2",
        },
      ],
      confidence: 0.81,
      autoScore: 0.84,
    });

    expect(result.episodeCreated).toBe(true);
    expect(result.episodeId).toBe("ep-valid");
    expect(result.summary).toBe("completed review\n{\"summary\":\"ok\"}");
    expect(result.reflectionSuccess).toBe(true);
    expect(result.rewardWriteSuccess).toBe(true);
    expect(mockQueryRawUnsafe).toHaveBeenCalledTimes(8);
  });

  it("returns a disabled result and skips DB writes when auto-feed is turned off", async () => {
    process.env.DATA_AGENT_AUTOFED = "false";

    const result = await autoFeedRun(BASE_INPUT);

    expect(result.summary).toBe("Auto-feed disabled");
    expect(result.episodeCreated).toBe(false);
    expect(result.reflectionSuccess).toBe(false);
    expect(result.rewardWriteSuccess).toBe(false);
    expect(mockQueryRawUnsafe).not.toHaveBeenCalled();
  });
});
