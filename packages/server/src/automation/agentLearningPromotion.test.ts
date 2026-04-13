import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  runUpdateMock,
  promoteRunToLongTermMemoryMock,
  withTimeoutMock,
  captureAutomationTimeoutMock,
} = vi.hoisted(() => ({
  runUpdateMock: vi.fn(),
  promoteRunToLongTermMemoryMock: vi.fn(),
  withTimeoutMock: vi.fn(),
  captureAutomationTimeoutMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    run: { update: runUpdateMock },
  },
}));

vi.mock("../services/agent-learning.service", () => ({
  promoteRunToLongTermMemory: promoteRunToLongTermMemoryMock,
}));

vi.mock("./timeout", () => ({
  withTimeout: withTimeoutMock,
}));

vi.mock("./sentry", () => ({
  captureAutomationTimeout: captureAutomationTimeoutMock,
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { handleAgentLearningPromotion } from "./agentLearningPromotion";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const RUN_ID = "33333333-3333-4333-8333-333333333333";

const baseEvent = {
  type: "agent.run.completed" as const,
  runId: RUN_ID,
  orgId: ORG_ID,
  userId: USER_ID,
  status: "succeeded" as const,
  conversationId: null,
  dealId: null,
  jurisdictionId: null,
  runType: null,
  inputPreview: null,
  queryIntent: null,
};

const promotionResult = {
  trajectoryLogId: "traj-1",
  episodicEntryId: "ep-1",
  promotedFactCount: 0,
  updatedSkillCount: 0,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("handleAgentLearningPromotion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runUpdateMock.mockResolvedValue({});
    promoteRunToLongTermMemoryMock.mockResolvedValue(promotionResult);
    // Default: withTimeout passes through the resolved value
    withTimeoutMock.mockImplementation(
      (promise: Promise<unknown>) => promise,
    );
  });

  it("updates memoryPromotionStatus to succeeded on success", async () => {
    await handleAgentLearningPromotion(baseEvent);

    // Initial status update to "processing"
    expect(runUpdateMock).toHaveBeenCalledWith({
      where: { id: RUN_ID },
      data: expect.objectContaining({ memoryPromotionStatus: "processing" }),
    });

    // Final status update to "succeeded"
    expect(runUpdateMock).toHaveBeenCalledWith({
      where: { id: RUN_ID },
      data: expect.objectContaining({ memoryPromotionStatus: "succeeded" }),
    });
  });

  it("updates memoryPromotionStatus to failed on error", async () => {
    const err = new Error("promotion failed");
    withTimeoutMock.mockRejectedValue(err);

    await expect(handleAgentLearningPromotion(baseEvent)).rejects.toThrow(
      "promotion failed",
    );

    expect(runUpdateMock).toHaveBeenCalledWith({
      where: { id: RUN_ID },
      data: expect.objectContaining({
        memoryPromotionStatus: "failed",
        memoryPromotionError: "promotion failed",
      }),
    });
  });

  it("updates memoryPromotionStatus to skipped_timeout on timeout (withTimeout returns null)", async () => {
    // withTimeout returns null to signal a timeout
    withTimeoutMock.mockResolvedValue(null);

    await handleAgentLearningPromotion(baseEvent);

    expect(captureAutomationTimeoutMock).toHaveBeenCalledOnce();
    expect(runUpdateMock).toHaveBeenCalledWith({
      where: { id: RUN_ID },
      data: expect.objectContaining({
        memoryPromotionStatus: "skipped_timeout",
      }),
    });
    // Should NOT update to "succeeded"
    const successCall = runUpdateMock.mock.calls.find(
      (call: Array<{ data?: { memoryPromotionStatus?: string } }>) =>
        call[0]?.data?.memoryPromotionStatus === "succeeded",
    );
    expect(successCall).toBeUndefined();
  });

  it("is a no-op when agentLearning.enabled is false", async () => {
    // Temporarily override the config
    const config = await import("./config");
    const original = config.AUTOMATION_CONFIG.agentLearning.enabled;

    // The config is frozen — mock the entire config module to return enabled: false
    vi.doMock("./config", () => ({
      AUTOMATION_CONFIG: {
        agentLearning: { enabled: false },
      },
    }));

    // Re-import the handler with the new mock
    vi.resetModules();
    const { handleAgentLearningPromotion: handler } = await import(
      "./agentLearningPromotion"
    );

    await handler(baseEvent);

    // No DB writes should occur
    expect(runUpdateMock).not.toHaveBeenCalled();
    expect(promoteRunToLongTermMemoryMock).not.toHaveBeenCalled();

    // Restore
    vi.doUnmock("./config");
    // Restore original value reference for type safety (no-op on frozen object)
    void original;
  });
});
