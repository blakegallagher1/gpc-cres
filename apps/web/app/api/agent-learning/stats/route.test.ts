import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { resolveAuthMock, getAgentLearningStatsMock } = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  getAgentLearningStatsMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@gpc/server", () => ({
  getAgentLearningStats: getAgentLearningStatsMock,
}));

import { GET } from "./route";

describe("/api/agent-learning/stats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when the request is unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const response = await GET(
      new NextRequest("http://localhost/api/agent-learning/stats"),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("returns the aggregated agent-learning counters", async () => {
    resolveAuthMock.mockResolvedValue({
      orgId: "org-1",
      userId: "user-1",
    });
    getAgentLearningStatsMock.mockResolvedValue({
      totalPromotedRuns: 9,
      pendingRuns: 3,
      failedRuns: 2,
      trajectoryLogCount: 12,
      episodicEntryCount: 11,
      proceduralSkillCount: 4,
      averagePromotionLatencyMs: 1450.5,
      topMemoryPromotionErrors: [
        { message: "missing context", count: 2 },
        { message: "write gate timeout", count: 1 },
      ],
    });

    const response = await GET(
      new NextRequest("http://localhost/api/agent-learning/stats"),
    );

    expect(response.status).toBe(200);
    expect(getAgentLearningStatsMock).toHaveBeenCalledWith("org-1");
    await expect(response.json()).resolves.toEqual({
      totalPromotedRuns: 9,
      pendingRuns: 3,
      failedRuns: 2,
      trajectoryLogCount: 12,
      episodicEntryCount: 11,
      proceduralSkillCount: 4,
      averagePromotionLatencyMs: 1450.5,
      topMemoryPromotionErrors: [
        { message: "missing context", count: 2 },
        { message: "write gate timeout", count: 1 },
      ],
    });
  });
});
