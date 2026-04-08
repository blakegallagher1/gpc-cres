import { beforeEach, describe, expect, it, vi } from "vitest";

const { createTrajectoryLogFromRunMock } = vi.hoisted(() => ({
  createTrajectoryLogFromRunMock: vi.fn(),
}));

vi.mock("@gpc/server/services/trajectory-log.service", () => ({
  createTrajectoryLogFromRun: createTrajectoryLogFromRunMock,
}));

import { createTrajectoryLogFromRun } from "../trajectoryLog.service";

describe("createTrajectoryLogFromRun wrapper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the package service result for a completed run", async () => {
    createTrajectoryLogFromRunMock.mockResolvedValue({
      trajectoryLogId: "trajectory-1",
      agentId: "Research",
      taskInput: "Assess the zoning risk for this deal.",
    });

    const input = {
      runId: "run-1",
      orgId: "org-1",
      userId: "user-1",
      conversationId: "conversation-1",
      dealId: "deal-input",
      jurisdictionId: "jurisdiction-input",
      runType: "TRIAGE",
      status: "failed" as const,
      inputPreview: "Assess the zoning risk for this deal.",
      queryIntent: "entitlements",
    };

    const result = await createTrajectoryLogFromRun(input);

    expect(createTrajectoryLogFromRunMock).toHaveBeenCalledWith(input);
    expect(result).toEqual({
      trajectoryLogId: "trajectory-1",
      agentId: "Research",
      taskInput: "Assess the zoning risk for this deal.",
    });
  });

  it("passes through inputPreview-only requests", async () => {
    createTrajectoryLogFromRunMock.mockResolvedValue({
      trajectoryLogId: "trajectory-2",
      agentId: "Coordinator",
      taskInput: "Find similar entitlement wins.",
    });

    const input = {
      runId: "run-2",
      orgId: "org-1",
      userId: "user-1",
      status: "succeeded" as const,
      inputPreview: "Find similar entitlement wins.",
    };

    const result = await createTrajectoryLogFromRun(input);

    expect(createTrajectoryLogFromRunMock).toHaveBeenCalledWith(input);
    expect(result.taskInput).toBe("Find similar entitlement wins.");
  });

  it("passes through requests that rely on conversation lookup inside the package service", async () => {
    createTrajectoryLogFromRunMock.mockResolvedValue({
      trajectoryLogId: "trajectory-3",
      agentId: "Coordinator",
      taskInput: "What comps support this pricing?",
    });

    const input = {
      runId: "run-3",
      orgId: "org-1",
      userId: "user-1",
      conversationId: "conversation-3",
      status: "succeeded" as const,
    };

    const result = await createTrajectoryLogFromRun(input);

    expect(createTrajectoryLogFromRunMock).toHaveBeenCalledWith(input);
    expect(result.taskInput).toBe("What comps support this pricing?");
  });
});
