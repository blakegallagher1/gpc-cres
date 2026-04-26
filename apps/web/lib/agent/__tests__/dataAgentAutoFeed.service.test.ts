import { describe, expect, it, vi, beforeEach } from "vitest";

const {
  autoFeedRunInPackageMock,
  mockLogger,
  mockRecordDataAgentAutoFeed,
} = vi.hoisted(() => ({
  autoFeedRunInPackageMock: vi.fn(),
  mockLogger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
  mockRecordDataAgentAutoFeed: vi.fn(),
}));

vi.mock("@gpc/server/services/data-agent-auto-feed.service", () => ({
  autoFeedRun: autoFeedRunInPackageMock,
}));

vi.mock("../loggerAdapter", () => ({
  logger: mockLogger,
  recordDataAgentAutoFeed: mockRecordDataAgentAutoFeed,
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
    autoFeedRunInPackageMock.mockReset();
    mockLogger.warn.mockReset();
    mockLogger.info.mockReset();
    mockLogger.error.mockReset();
    mockRecordDataAgentAutoFeed.mockReset();
    autoFeedRunInPackageMock.mockResolvedValue({
      summary: "ok",
      reflectionSuccess: true,
      rewardWriteSuccess: true,
      episodeCreated: true,
      episodeId: "episode-1",
      errors: [],
    });
  });

  it("delegates auto-feed execution to the package service with app runtime deps", async () => {
    const result = await autoFeedRun(BASE_INPUT);

    expect(result).toEqual({
      summary: "ok",
      reflectionSuccess: true,
      rewardWriteSuccess: true,
      episodeCreated: true,
      episodeId: "episode-1",
      errors: [],
    });
    expect(autoFeedRunInPackageMock).toHaveBeenCalledWith(
      BASE_INPUT,
      expect.objectContaining({
        isSchemaDriftError: expect.any(Function),
        isLocalAppRuntime: expect.any(Function),
        logger: mockLogger,
        recordDataAgentAutoFeed: mockRecordDataAgentAutoFeed,
      }),
    );
  });

  it("surfaces package-level failures without mutating the wrapper contract", async () => {
    autoFeedRunInPackageMock.mockRejectedValueOnce(new Error("boom"));

    await expect(autoFeedRun(BASE_INPUT)).rejects.toThrow("boom");
  });
});
