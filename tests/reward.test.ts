/**
 * Unit tests for reward signal persistence and outcome updates.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

const { mockFindEpisode, mockCreateReward, mockEpisodeUpdate } = vi.hoisted(() => ({
  mockFindEpisode: vi.fn(),
  mockCreateReward: vi.fn(),
  mockEpisodeUpdate: vi.fn(),
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    rewardSignal: {
      create: mockCreateReward,
    },
    episode: {
      findUnique: mockFindEpisode,
      update: mockEpisodeUpdate,
    },
  },
}));

vi.mock("../openTelemetry/setup.ts", () => ({
  withSpan: async (_name: string, fn: () => Promise<unknown> | unknown) => fn(),
}));

import { addRewardSignal } from "../services/reward.service.ts";

beforeEach(() => {
  mockFindEpisode.mockReset();
  mockCreateReward.mockReset();
  mockEpisodeUpdate.mockReset();
});

describe("reward.service", () => {
  it("adds reward signal and updates episode outcome", async () => {
    mockFindEpisode.mockResolvedValue({ id: "ep-1" });
    mockCreateReward.mockResolvedValue({
      id: "rs-1",
      episodeId: "ep-1",
      userScore: 5,
      autoScore: 0.9,
      timestamp: new Date("2026-01-01T00:00:00.000Z"),
    });
    mockEpisodeUpdate.mockResolvedValue({ id: "ep-1" });

    const result = await addRewardSignal("ep-1", 5, 0.9);

    expect(mockFindEpisode).toHaveBeenCalledWith({ where: { id: "ep-1" } });
    expect(mockCreateReward).toHaveBeenCalledWith({
      data: {
        episodeId: "ep-1",
        userScore: 5,
        autoScore: 0.9,
      },
    });
    expect(mockEpisodeUpdate).toHaveBeenCalledWith({
      where: { id: "ep-1" },
      data: { outcomeSignal: "positive_feedback" },
    });
    expect(result.userScore).toBe(5);
  });

  it("rejects invalid user scores", async () => {
    await expect(addRewardSignal("ep-1", 99, 0.9)).rejects.toThrow(
      "userScore must be an integer between 0 and 5",
    );
  });

  it("rejects unknown episodes", async () => {
    mockFindEpisode.mockResolvedValue(null);
    await expect(addRewardSignal("missing", 3, 0.5)).rejects.toThrow(
      "does not exist",
    );
  });
});
