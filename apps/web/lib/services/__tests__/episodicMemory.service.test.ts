import { beforeEach, describe, expect, it, vi } from "vitest";

const { createEpisodicEntryFromTrajectoryLogMock } = vi.hoisted(() => ({
  createEpisodicEntryFromTrajectoryLogMock: vi.fn(),
}));

vi.mock("@gpc/server/services/episodic-memory.service", () => ({
  createEpisodicEntryFromTrajectoryLog: createEpisodicEntryFromTrajectoryLogMock,
}));

import { createEpisodicEntryFromTrajectoryLog } from "../episodicMemory.service";

describe("createEpisodicEntryFromTrajectoryLog wrapper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the package service result for a succeeded run", async () => {
    createEpisodicEntryFromTrajectoryLogMock.mockResolvedValue({
      episodicEntryId: "episode-1",
      embeddingId: "chunk-1",
    });

    const input = {
      orgId: "org-1",
      userId: "user-1",
      runId: "run-1",
      dealId: "deal-1",
      jurisdictionId: "jurisdiction-1",
      conversationId: "conversation-1",
      runType: "TRIAGE",
      queryIntent: "entitlements",
      trajectoryLogId: "trajectory-1",
      agentId: "Research",
      taskInput: "Find the zoning path for this parcel.",
      status: "succeeded" as const,
    };

    const result = await createEpisodicEntryFromTrajectoryLog(input);

    expect(createEpisodicEntryFromTrajectoryLogMock).toHaveBeenCalledWith(input);
    expect(result).toEqual({
      episodicEntryId: "episode-1",
      embeddingId: "chunk-1",
    });
  });

  it.each([
    ["failed", "episode-failed"],
    ["canceled", "episode-canceled"],
  ] as const)(
    "passes through %s runs to the package service",
    async (status, episodicEntryId) => {
      createEpisodicEntryFromTrajectoryLogMock.mockResolvedValue({
        episodicEntryId,
        embeddingId: null,
      });

      const input = {
        orgId: "org-1",
        userId: "user-1",
        runId: `run-${status}`,
        trajectoryLogId: "trajectory-1",
        agentId: "Research",
        taskInput: "Review the prior run.",
        status,
      };

      const result = await createEpisodicEntryFromTrajectoryLog(input);

      expect(createEpisodicEntryFromTrajectoryLogMock).toHaveBeenCalledWith(input);
      expect(result).toEqual({
        episodicEntryId,
        embeddingId: null,
      });
    },
  );
});
