import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { resolveAuthMock, dbMock } = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  dbMock: {
    prisma: {
      run: {
        count: vi.fn(),
      },
      trajectoryLog: {
        count: vi.fn(),
      },
      episodicEntry: {
        count: vi.fn(),
      },
      proceduralSkill: {
        count: vi.fn(),
      },
      $queryRawUnsafe: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@entitlement-os/db", () => dbMock);

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
    dbMock.prisma.run.count
      .mockResolvedValueOnce(9)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(2);
    dbMock.prisma.trajectoryLog.count.mockResolvedValue(12);
    dbMock.prisma.episodicEntry.count.mockResolvedValue(11);
    dbMock.prisma.proceduralSkill.count.mockResolvedValue(4);
    dbMock.prisma.$queryRawUnsafe
      .mockResolvedValueOnce([{ avg_ms: "1450.5" }])
      .mockResolvedValueOnce([
        { error_message: "missing context", error_count: 2n },
        { error_message: "write gate timeout", error_count: 1n },
      ]);

    const response = await GET(
      new NextRequest("http://localhost/api/agent-learning/stats"),
    );

    expect(response.status).toBe(200);
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
