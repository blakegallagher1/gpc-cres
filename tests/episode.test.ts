/**
 * Unit tests for episode creation.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

const { mockFindUnique, mockCreate, mockCreateSummary } = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockCreate: vi.fn(),
  mockCreateSummary: vi.fn(async () => "agent memory summary"),
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    episode: {
      findUnique: mockFindUnique,
      create: mockCreate,
    },
  },
}));

vi.mock("../ai/summary.ts", () => ({
  createSummary: mockCreateSummary,
}));

vi.mock("../openTelemetry/setup.ts", () => ({
  withSpan: async (_name: string, fn: () => Promise<unknown> | unknown) => fn(),
}));

import { createEpisodeFromRun } from "../services/episode.service.ts";

beforeEach(() => {
  mockFindUnique.mockReset();
  mockCreate.mockReset();
  mockCreateSummary.mockClear();
});

describe("episode.service", () => {
  it("creates a new episode from run state", async () => {
    const runState = {
      runId: "run-1",
      agentIntent: "evaluate permit risk",
      evidenceHash: "hash-1",
      retrievalMeta: { query: "permit" },
      modelOutputs: { finalOutput: "done" },
      confidence: 0.7,
    };

    mockFindUnique.mockResolvedValue(null);
    mockCreate.mockResolvedValue({
      id: "ep-1",
      runId: "run-1",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      agentIntent: runState.agentIntent,
      evidenceHash: runState.evidenceHash,
      retrievalMeta: runState.retrievalMeta,
      modelOutputs: runState.modelOutputs,
      confidence: 0.7,
      outcomeSignal: null,
      nextStateHash: null,
      summary: "agent memory summary",
    });

    const episode = await createEpisodeFromRun(runState);

    expect(mockCreateSummary).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(episode).toMatchObject({
      id: "ep-1",
      runId: "run-1",
      summary: "agent memory summary",
      confidence: 0.7,
    });
  });

  it("returns existing episode when runId already exists", async () => {
    const cached = {
      id: "ep-2",
      runId: "run-2",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      agentIntent: "cached",
      evidenceHash: "hash-2",
      retrievalMeta: {},
      modelOutputs: {},
      confidence: 0.5,
      outcomeSignal: null,
      nextStateHash: null,
      summary: "cached summary",
    };
    mockFindUnique.mockResolvedValue(cached);

    const episode = await createEpisodeFromRun({
      runId: "run-2",
      agentIntent: "skip",
      evidenceHash: "hash-2",
      retrievalMeta: {},
      modelOutputs: {},
      confidence: null,
    });

    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockCreateSummary).not.toHaveBeenCalled();
    expect(episode.summary).toBe("cached summary");
  });

  it("validates required runState", async () => {
    await expect(
      createEpisodeFromRun({
        runId: "",
        agentIntent: "",
        evidenceHash: "",
        retrievalMeta: {},
        modelOutputs: {},
      } as never),
    ).rejects.toThrow("runState.runId is required");
  });
});
