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
const { captureAutomationTimeoutMock } = vi.hoisted(() => ({
  captureAutomationTimeoutMock: vi.fn(),
}));

vi.mock("@entitlement-os/db", () => dbMock);
vi.mock("@/lib/services/agentLearning.service", () => ({
  promoteRunToLongTermMemory: promoteRunToLongTermMemoryMock,
}));
vi.mock("../sentry", () => ({
  captureAutomationTimeout: captureAutomationTimeoutMock,
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
    vi.useRealTimers();
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

    expect(promoteRunToLongTermMemoryMock).toHaveBeenCalledWith(
      expect.objectContaining({
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
        signal: expect.any(AbortSignal),
      }),
    );
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

  it("marks the run as skipped_timeout when promotion exceeds the timeout", async () => {
    vi.useFakeTimers();
    promoteRunToLongTermMemoryMock.mockReturnValue(new Promise(() => {}));

    const promise = handleAgentLearningPromotion(BASE_EVENT);

    await vi.advanceTimersByTimeAsync(20_000);

    await expect(promise).resolves.toBeUndefined();
    expect(captureAutomationTimeoutMock).toHaveBeenCalledWith(
      expect.objectContaining({
        handler: "agentLearningPromotion",
        label: "promoteRunToLongTermMemory timed out after 20000ms",
      }),
    );
    expect(dbMock.prisma.run.update).toHaveBeenNthCalledWith(2, {
      where: { id: "run-1" },
      data: {
        memoryPromotionStatus: "skipped_timeout",
        memoryPromotionError: "Timed out after 20000ms",
      },
    });
  });

  it("aborts the in-flight promotion when the timeout fires", async () => {
    vi.useFakeTimers();
    let receivedSignal: AbortSignal | null = null;
    promoteRunToLongTermMemoryMock.mockImplementationOnce(
      ({ signal }: { signal?: AbortSignal }) => {
        receivedSignal = signal ?? null;
        return new Promise(() => {});
      },
    );

    const promise = handleAgentLearningPromotion(BASE_EVENT);

    await vi.advanceTimersByTimeAsync(20_000);

    await expect(promise).resolves.toBeUndefined();
    expect(receivedSignal?.aborted).toBe(true);
  });

  it("swallows timeout-status write failures after the timeout fires", async () => {
    vi.useFakeTimers();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    promoteRunToLongTermMemoryMock.mockReturnValue(new Promise(() => {}));
    dbMock.prisma.run.update
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("write failed"));

    const promise = handleAgentLearningPromotion(BASE_EVENT);

    await vi.advanceTimersByTimeAsync(20_000);

    await expect(promise).resolves.toBeUndefined();
    expect(captureAutomationTimeoutMock).toHaveBeenCalledWith(
      expect.objectContaining({
        handler: "agentLearningPromotion",
        label: "promoteRunToLongTermMemory timed out after 20000ms",
      }),
    );
    expect(errorSpy).toHaveBeenCalledWith(
      "[automation] Failed to record agent learning timeout:",
      "write failed",
    );

    errorSpy.mockRestore();
  });
});
