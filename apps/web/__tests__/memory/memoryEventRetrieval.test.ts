import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    memoryEventLog: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: prismaMock,
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/services/entityResolution", () => ({
  resolveEntityId: vi.fn(),
}));

vi.mock("@/lib/server/requestContext", () => ({
  generateRequestId: () => "test-request-id",
}));

import { getMemoryEventService } from "@/lib/services/memoryEventService";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const ENTITY_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_ORG = "33333333-3333-4333-8333-333333333333";

describe("MemoryEventService — retrieval", () => {
  const service = getMemoryEventService();

  beforeEach(() => {
    prismaMock.memoryEventLog.findMany.mockReset();
    prismaMock.memoryEventLog.count.mockReset();
    prismaMock.memoryEventLog.groupBy.mockReset();
    prismaMock.$transaction.mockReset();
  });

  describe("getEntityMemory", () => {
    it("returns events in chronological order with orgId scope", async () => {
      const events = [
        { id: "e1", timestamp: "2026-02-20T10:00:00Z" },
        { id: "e2", timestamp: "2026-02-20T11:00:00Z" },
      ];
      prismaMock.memoryEventLog.findMany.mockResolvedValue(events);

      const result = await service.getEntityMemory(ENTITY_ID, ORG_ID);

      expect(result.events).toEqual(events);
      expect(prismaMock.memoryEventLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { entityId: ENTITY_ID, orgId: ORG_ID },
          orderBy: { timestamp: "asc" },
        }),
      );
    });

    it("scopes by orgId — different org gets different results", async () => {
      prismaMock.memoryEventLog.findMany.mockResolvedValue([]);

      await service.getEntityMemory(ENTITY_ID, OTHER_ORG);

      expect(prismaMock.memoryEventLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ orgId: OTHER_ORG }),
        }),
      );
    });

    it("supports cursor pagination", async () => {
      const events = Array.from({ length: 3 }, (_, i) => ({
        id: `e${i}`,
        timestamp: `2026-02-20T1${i}:00:00Z`,
      }));
      prismaMock.memoryEventLog.findMany.mockResolvedValue(events);

      const result = await service.getEntityMemory(ENTITY_ID, ORG_ID, {
        cursor: "cursor-id",
        limit: 2,
      });

      expect(prismaMock.memoryEventLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { gt: "cursor-id" },
          }),
          take: 3, // limit + 1 for hasMore check
        }),
      );
      expect(result.pagination.hasMore).toBe(true);
      expect(result.events).toHaveLength(2);
      expect(result.pagination.nextCursor).toBe("e1");
    });

    it("reports hasMore=false when fewer results than limit", async () => {
      prismaMock.memoryEventLog.findMany.mockResolvedValue([
        { id: "e1" },
      ]);

      const result = await service.getEntityMemory(ENTITY_ID, ORG_ID, {
        limit: 50,
      });

      expect(result.pagination.hasMore).toBe(false);
      expect(result.pagination.nextCursor).toBeNull();
    });

    it("applies factType and status filters", async () => {
      prismaMock.memoryEventLog.findMany.mockResolvedValue([]);

      await service.getEntityMemory(ENTITY_ID, ORG_ID, {
        factType: "zoning",
        status: "accepted",
      });

      expect(prismaMock.memoryEventLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            factType: "zoning",
            status: "accepted",
          }),
        }),
      );
    });
  });

  describe("getEventStats", () => {
    it("returns aggregated stats scoped by orgId and days", async () => {
      prismaMock.$transaction.mockResolvedValue([
        42, // total
        [{ status: "accepted", _count: 30 }],
        [{ factType: "zoning", _count: 15 }],
        [{ sourceType: "agent", _count: 25 }],
        [], // recentEvents
      ]);

      const stats = await service.getEventStats(ORG_ID, 7);

      expect(stats.total).toBe(42);
      expect(stats.byStatus).toEqual([{ status: "accepted", count: 30 }]);
      expect(stats.byFactType).toEqual([{ factType: "zoning", count: 15 }]);
      expect(stats.bySourceType).toEqual([{ sourceType: "agent", count: 25 }]);
      expect(stats.days).toBe(7);
    });
  });
});
