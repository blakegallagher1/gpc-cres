import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock, promoteRunToLongTermMemoryMock } = vi.hoisted(() => ({
  dbMock: {
    prisma: {
      run: {
        update: vi.fn(),
      },
    },
  },
  promoteRunToLongTermMemoryMock: vi.fn(),
}));

vi.mock("@entitlement-os/db", () => dbMock);
vi.mock("@/lib/services/agentLearning.service", () => ({
  promoteRunToLongTermMemory: promoteRunToLongTermMemoryMock,
}));

import { handleAgentLearningPromotion } from "../agentLearningPromotion";

const BASE_EVENT = {
  type: "agent.run.completed" as const,
  runId: "run-1",
  orgId: "org-1",
  userId: "user-1",
  conversationId: "conversation-1",
  dealId: "deal-1",
  jurisdictionId: "jurisdiction-1",
  runType: "TRIAGE",
  status: "succeeded" as const,
  inputPreview: "Summarize the zoning path.",
  queryIntent: "entitlements",
};

describe("handleAgentLearningPromotion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.prisma.run.update.mockResolvedValue(undefined);
    promoteRunToLongTermMemoryMock.mockResolvedValue({
      trajectoryLogId: "trajectory-1",
      episodicEntryId: "episode-1",
      promotedFactCount: 0,
      updatedSkillCount: 0,
    });
  });

  it("marks the run as processing before promotion", async () => {
    await handleAgentLearningPromotion(BASE_EVENT);

    expect(dbMock.prisma.run.update).toHaveBeenNthCalledWith(1, {
      where: { id: "run-1" },
      data: {
        memoryPromotionStatus: "processing",
        memoryPromotionError: null,
      },
    });
  });

  it("marks the run as succeeded after successful promotion", async () => {
    await handleAgentLearningPromotion(BASE_EVENT);

    expect(promoteRunToLongTermMemoryMock).toHaveBeenCalledWith({
      runId: "run-1",
      orgId: "org-1",
      userId: "user-1",
      conversationId: "conversation-1",
      dealId: "deal-1",
      jurisdictionId: "jurisdiction-1",
      runType: "TRIAGE",
      status: "succeeded",
      inputPreview: "Summarize the zoning path.",
      queryIntent: "entitlements",
    });
    expect(dbMock.prisma.run.update).toHaveBeenNthCalledWith(2, {
      where: { id: "run-1" },
      data: {
        memoryPromotionStatus: "succeeded",
        memoryPromotedAt: expect.any(Date),
        memoryPromotionError: null,
      },
    });
  });

  it("marks the run as failed and stores the promotion error", async () => {
    promoteRunToLongTermMemoryMock.mockRejectedValueOnce(new Error("boom"));

    await expect(handleAgentLearningPromotion(BASE_EVENT)).rejects.toThrow("boom");

    expect(dbMock.prisma.run.update).toHaveBeenNthCalledWith(2, {
      where: { id: "run-1" },
      data: {
        memoryPromotionStatus: "failed",
        memoryPromotionError: "boom",
      },
    });
  });
});
