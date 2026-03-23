import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { resolveAuthMock } = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
}));

const {
  queryRawUnsafeMock,
  memoryVerifiedCountMock,
  internalEntityCountMock,
  runCountMock,
  runAggregateMock,
  runFindManyMock,
  runGroupByMock,
  memoryEventLogFindManyMock,
  trajectoryLogCountMock,
  episodicEntryCountMock,
  proceduralSkillCountMock,
  proceduralSkillEpisodeCountMock,
  dealCountMock,
  conversationCountMock,
} = vi.hoisted(() => ({
  queryRawUnsafeMock: vi.fn(),
  memoryVerifiedCountMock: vi.fn(),
  internalEntityCountMock: vi.fn(),
  runCountMock: vi.fn(),
  runAggregateMock: vi.fn(),
  runFindManyMock: vi.fn(),
  runGroupByMock: vi.fn(),
  memoryEventLogFindManyMock: vi.fn(),
  trajectoryLogCountMock: vi.fn(),
  episodicEntryCountMock: vi.fn(),
  proceduralSkillCountMock: vi.fn(),
  proceduralSkillEpisodeCountMock: vi.fn(),
  dealCountMock: vi.fn(),
  conversationCountMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    $queryRawUnsafe: queryRawUnsafeMock,
    memoryVerified: { count: memoryVerifiedCountMock },
    internalEntity: { count: internalEntityCountMock },
    run: {
      count: runCountMock,
      aggregate: runAggregateMock,
      findMany: runFindManyMock,
      groupBy: runGroupByMock,
    },
    memoryEventLog: { findMany: memoryEventLogFindManyMock },
    trajectoryLog: { count: trajectoryLogCountMock },
    episodicEntry: { count: episodicEntryCountMock },
    proceduralSkill: { count: proceduralSkillCountMock },
    proceduralSkillEpisode: { count: proceduralSkillEpisodeCountMock },
    deal: { count: dealCountMock },
    conversation: { count: conversationCountMock },
  },
}));

import { GET } from "./route";

const AUTH = {
  userId: "11111111-1111-4111-8111-111111111111",
  orgId: "22222222-2222-4222-8222-222222222222",
};

function setupOverviewMocks() {
  queryRawUnsafeMock
    .mockResolvedValueOnce([{ count: BigInt(11) }])
    .mockResolvedValueOnce([{ content_type: "memory_note", count: BigInt(3) }]);
  memoryVerifiedCountMock.mockResolvedValue(2);
  internalEntityCountMock.mockResolvedValue(4);
  runCountMock.mockResolvedValue(5);
  runAggregateMock.mockResolvedValue({ _count: 5 });
  runFindManyMock.mockResolvedValue([]);
  memoryEventLogFindManyMock.mockResolvedValue([]);
  trajectoryLogCountMock.mockResolvedValue(6);
  episodicEntryCountMock.mockResolvedValue(7);
  proceduralSkillCountMock.mockResolvedValue(8);
  runGroupByMock.mockImplementation(async ({ by }: { by: string[] }) => {
    if (by[0] === "memoryPromotionStatus") {
      return [{ memoryPromotionStatus: "promoted", _count: 3 }];
    }
    return [];
  });
}

describe("GET /api/admin/stats", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resolveAuthMock.mockResolvedValue(AUTH);
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValueOnce(null);

    const response = await GET(new NextRequest("http://localhost/api/admin/stats"));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 400 for invalid tab names", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/admin/stats?tab=invalid"),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Invalid tab parameter",
      detail: "Expected one of: overview, knowledge, memory, agents, system, all",
    });
  });

  it("returns overview data when procedural skill episodes table is missing", async () => {
    setupOverviewMocks();
    proceduralSkillEpisodeCountMock.mockRejectedValueOnce({
      code: "P2021",
      message: 'relation "public.procedural_skill_episodes" does not exist',
    });

    const response = await GET(
      new NextRequest("http://localhost/api/admin/stats?tab=overview"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.overview).toMatchObject({
      knowledgeCount: 11,
      verifiedCount: 2,
      entityCount: 4,
      trajectoryLogCount: 6,
      episodicEntryCount: 7,
      proceduralSkillCount: 8,
      proceduralSkillEpisodeCount: 0,
      runs24h: 5,
      promotionBreakdown: { promoted: 3 },
      knowledgeByType: [{ contentType: "memory_note", count: 3 }],
    });
  });

  it("returns system counts when procedural skill episodes table is missing", async () => {
    runCountMock.mockResolvedValue(10);
    trajectoryLogCountMock.mockResolvedValue(20);
    episodicEntryCountMock.mockResolvedValue(30);
    proceduralSkillCountMock.mockResolvedValue(40);
    proceduralSkillEpisodeCountMock.mockRejectedValueOnce({
      code: "P2021",
      message: 'relation "public.procedural_skill_episodes" does not exist',
    });
    memoryVerifiedCountMock.mockResolvedValue(50);
    internalEntityCountMock.mockResolvedValue(60);
    dealCountMock.mockResolvedValue(70);
    conversationCountMock.mockResolvedValue(80);
    queryRawUnsafeMock.mockResolvedValueOnce([{ count: BigInt(90) }]);

    const response = await GET(
      new NextRequest("http://localhost/api/admin/stats?tab=system"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.system).toEqual({
      tableCounts: {
        runs: 10,
        trajectoryLogs: 20,
        episodicEntries: 30,
        proceduralSkills: 40,
        proceduralSkillEpisodes: 0,
        memoryVerified: 50,
        internalEntities: 60,
        deals: 70,
        conversations: 80,
        knowledgeEmbeddings: 90,
      },
    });
  });

  it("returns agent runs without promotion metadata when learning columns are missing", async () => {
    runFindManyMock
      .mockRejectedValueOnce({
        code: "P2022",
        message: 'column runs.memory_promotion_status does not exist',
      })
      .mockResolvedValueOnce([
        {
          id: "run-1",
          runType: "chat",
          status: "succeeded",
          startedAt: new Date("2026-03-20T10:00:00.000Z"),
          finishedAt: new Date("2026-03-20T10:01:00.000Z"),
          error: null,
          dealId: "deal-1",
        },
      ]);
    runCountMock.mockResolvedValue(1);
    runAggregateMock.mockResolvedValue({ _count: 1 });
    runGroupByMock.mockResolvedValueOnce([{ runType: "chat", _count: 1 }]);
    trajectoryLogCountMock.mockResolvedValue(2);
    episodicEntryCountMock.mockResolvedValue(3);
    proceduralSkillCountMock.mockResolvedValue(4);

    const response = await GET(
      new NextRequest("http://localhost/api/admin/stats?tab=agents"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.agents).toMatchObject({
      total: 1,
      dailyByRunType: [{ runType: "chat", count: 1 }],
      learningCounts: {
        trajectoryLogs: 2,
        episodicEntries: 3,
        proceduralSkills: 4,
      },
    });
    expect(body.agents.runs).toEqual([
      expect.objectContaining({
        id: "run-1",
        memoryPromotionStatus: null,
        memoryPromotedAt: null,
        memoryPromotionError: null,
      }),
    ]);
  });

  it("returns partial overview errors with fallback values", async () => {
    setupOverviewMocks();
    memoryVerifiedCountMock.mockRejectedValueOnce(new Error("db unavailable"));
    proceduralSkillEpisodeCountMock.mockResolvedValueOnce(9);

    const response = await GET(
      new NextRequest("http://localhost/api/admin/stats?tab=overview"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.errors).toMatchObject({
      overview: {
        message: "Unable to load this section",
        detail: "db unavailable",
      },
    });
    expect(body.overview).toMatchObject({
      knowledgeCount: 11,
      verifiedCount: 0,
      entityCount: 4,
      proceduralSkillEpisodeCount: 9,
    });
  });

});
