import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, resolveEntityIdMock } = vi.hoisted(() => ({
  prismaMock: {
    memoryEventLog: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  resolveEntityIdMock: vi.fn(),
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: prismaMock,
}));

vi.mock("server-only", () => ({}));

vi.mock("@gpc/server/services/entity-resolution.service", () => ({
  resolveEntityId: resolveEntityIdMock,
}));

vi.mock("@/lib/server/requestContext", () => ({
  generateRequestId: () => "test-request-id",
}));

import { getMemoryEventService } from "@/lib/services/memoryEventService";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const ENTITY_ID = "22222222-2222-4222-8222-222222222222";

describe("MemoryEventService", () => {
  const service = getMemoryEventService();

  beforeEach(() => {
    prismaMock.memoryEventLog.create.mockReset();
    prismaMock.memoryEventLog.findMany.mockReset();
    prismaMock.memoryEventLog.count.mockReset();
    prismaMock.memoryEventLog.groupBy.mockReset();
    prismaMock.$transaction.mockReset();
    resolveEntityIdMock.mockReset();
  });

  describe("recordEvent", () => {
    it("creates event with orgId and resolved entityId", async () => {
      resolveEntityIdMock.mockResolvedValue(ENTITY_ID);
      const createdEvent = {
        id: "event-1",
        orgId: ORG_ID,
        entityId: ENTITY_ID,
        sourceType: "agent",
        factType: "zoning",
        status: "attempted",
        payloadJson: { zone: "M1" },
        requestId: "test-request-id",
      };
      prismaMock.memoryEventLog.create.mockResolvedValue(createdEvent);

      const result = await service.recordEvent({
        orgId: ORG_ID,
        address: "123 Main St",
        sourceType: "agent",
        factType: "zoning",
        payloadJson: { zone: "M1" },
        status: "attempted",
      });

      expect(result.id).toBe("event-1");
      expect(result.orgId).toBe(ORG_ID);
      expect(result.entityId).toBe(ENTITY_ID);
      expect(prismaMock.memoryEventLog.create).toHaveBeenCalledTimes(1);
    });

    it("uses provided entityId without resolving", async () => {
      const createdEvent = {
        id: "event-2",
        orgId: ORG_ID,
        entityId: ENTITY_ID,
      };
      prismaMock.memoryEventLog.create.mockResolvedValue(createdEvent);

      await service.recordEvent({
        orgId: ORG_ID,
        entityId: ENTITY_ID,
        sourceType: "user",
        factType: "ownership",
        payloadJson: { owner: "John" },
        status: "accepted",
      });

      expect(resolveEntityIdMock).not.toHaveBeenCalled();
      expect(prismaMock.memoryEventLog.create).toHaveBeenCalledTimes(1);
    });

    it("always calls create, never update or delete (append-only)", async () => {
      resolveEntityIdMock.mockResolvedValue(ENTITY_ID);
      prismaMock.memoryEventLog.create.mockResolvedValue({ id: "event-3" });

      await service.recordEvent({
        orgId: ORG_ID,
        address: "456 Oak Ave",
        sourceType: "system",
        factType: "flood_zone",
        payloadJson: { zone: "AE" },
        status: "attempted",
      });

      expect(prismaMock.memoryEventLog.create).toHaveBeenCalledTimes(1);
      // Verify no update/delete methods exist or are called
      expect(prismaMock.memoryEventLog).not.toHaveProperty("update");
      expect(prismaMock.memoryEventLog).not.toHaveProperty("delete");
    });

    it("sets requestId on every event", async () => {
      resolveEntityIdMock.mockResolvedValue(ENTITY_ID);
      prismaMock.memoryEventLog.create.mockResolvedValue({ id: "event-4" });

      await service.recordEvent({
        orgId: ORG_ID,
        address: "789 Elm St",
        sourceType: "agent",
        factType: "environmental",
        payloadJson: {},
        status: "attempted",
      });

      const createCall = prismaMock.memoryEventLog.create.mock.calls[0][0];
      expect(createCall.data.requestId).toBe("test-request-id");
    });
  });
});
