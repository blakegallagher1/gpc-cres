import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, createStrictJsonResponseMock, recordEventMock } = vi.hoisted(() => ({
  prismaMock: {
    memoryVerified: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    memoryDraft: {
      create: vi.fn(),
    },
    memoryRejected: {
      create: vi.fn(),
    },
  },
  createStrictJsonResponseMock: vi.fn(),
  recordEventMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@entitlement-os/db", () => ({
  prisma: prismaMock,
}));

vi.mock("@entitlement-os/openai", () => ({
  createStrictJsonResponse: createStrictJsonResponseMock,
}));

vi.mock("@/lib/services/memoryEventService", () => ({
  getMemoryEventService: () => ({
    recordEvent: recordEventMock,
  }),
}));

vi.mock("@/lib/services/conflictDetection", () => ({
  detectConflicts: vi.fn().mockResolvedValue({
    hasConflict: false,
    conflictingRecords: [],
    conflictKeys: [],
  }),
}));

vi.mock("@/lib/services/correctionService", () => ({
  applyCorrection: vi.fn().mockResolvedValue({ id: "correction-record-1" }),
}));

vi.mock("@/lib/server/requestContext", () => ({
  generateRequestId: () => "test-request-id",
}));

import { memoryWriteGate } from "@/lib/services/memoryWriteGate";
import type { MemoryWrite } from "@/lib/schemas/memoryWrite";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const ENTITY_ID = "22222222-2222-4222-8222-222222222222";

const VALID_COMP_WRITE: MemoryWrite = {
  fact_type: "comp",
  entity_id: ENTITY_ID,
  source_type: "agent",
  timestamp: "2026-02-26T00:00:00Z",
  economic_weight: 0.85,
  volatility_class: "cyclical",
  payload: {
    sale_price: 2500000,
    price_per_unit: 125000,
    cap_rate: 6.5,
    noi: 162500,
    pad_count: 20,
    property_type: "industrial",
    market: "Baton Rouge",
    sale_date: "2026-01-15",
    source_url: null,
    buyer: null,
    seller: null,
    address: null,
  },
};

describe("memoryWriteGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordEventMock.mockResolvedValue({ id: "event-log-1" });
    prismaMock.memoryVerified.create.mockResolvedValue({ id: "verified-1" });
    prismaMock.memoryVerified.findMany.mockResolvedValue([]);
  });

  it("parses comp text into typed CompPayload and stores as verified", async () => {
    createStrictJsonResponseMock.mockResolvedValue({
      outputJson: VALID_COMP_WRITE,
    });

    const result = await memoryWriteGate(
      "123 Main sold for $2.5M, 6.5% cap, NOI $162,500",
      { entityId: ENTITY_ID, orgId: ORG_ID, address: "123 Main St" },
    );

    expect(result.decision).toBe("verified");
    expect(result.structuredMemoryWrite).not.toBeNull();
    expect(result.structuredMemoryWrite!.fact_type).toBe("comp");
    expect(result.structuredMemoryWrite!.payload).toHaveProperty("sale_price", 2500000);
    expect(result.structuredMemoryWrite!.payload).toHaveProperty("cap_rate", 6.5);
    expect(result.structuredMemoryWrite!.payload).toHaveProperty("noi", 162500);
    expect(result.eventLogId).toBe("event-log-1");
    expect(result.recordId).toBe("verified-1");
  });

  it("normalizes decimal cap rates to percentages when the prompt uses percent notation", async () => {
    createStrictJsonResponseMock.mockResolvedValue({
      outputJson: {
        ...VALID_COMP_WRITE,
        payload: {
          ...VALID_COMP_WRITE.payload,
          cap_rate: 0.061,
        },
      },
    });

    const result = await memoryWriteGate(
      "123 Main sold for $2.5M, 6.1% cap rate, NOI $162,500",
      { entityId: ENTITY_ID, orgId: ORG_ID, address: "123 Main St" },
    );

    expect(result.decision).toBe("verified");
    expect(result.structuredMemoryWrite?.payload).toHaveProperty("cap_rate", 6.1);
    expect(prismaMock.memoryVerified.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          payloadJson: expect.objectContaining({
            cap_rate: 6.1,
          }),
        }),
      }),
    );
  });

  it("rejects when OpenAI structured output parsing fails", async () => {
    createStrictJsonResponseMock.mockRejectedValue(
      new Error("JSON parse error: unexpected token"),
    );
    prismaMock.memoryRejected.create.mockResolvedValue({ id: "rejected-1" });

    const result = await memoryWriteGate(
      "garbled nonsense input &*^%$",
      { entityId: ENTITY_ID, orgId: ORG_ID },
    );

    expect(result.decision).toBe("rejected");
    expect(result.structuredMemoryWrite).toBeNull();
    expect(result.reasons).toContainEqual(
      expect.stringContaining("OpenAI structured output failed"),
    );
    expect(prismaMock.memoryRejected.create).toHaveBeenCalledTimes(1);
  });

  it("rejects when Zod validation fails (belt-and-suspenders)", async () => {
    const malformedWrite = {
      ...VALID_COMP_WRITE,
      economic_weight: 5.0, // > 1, fails Zod
    };
    createStrictJsonResponseMock.mockResolvedValue({
      outputJson: malformedWrite,
    });
    prismaMock.memoryRejected.create.mockResolvedValue({ id: "rejected-2" });

    const result = await memoryWriteGate(
      "some input text",
      { entityId: ENTITY_ID, orgId: ORG_ID },
    );

    expect(result.decision).toBe("rejected");
    expect(result.structuredMemoryWrite).toBeNull();
    expect(result.reasons).toContainEqual(
      expect.stringContaining("Zod validation failed"),
    );
    expect(prismaMock.memoryRejected.create).toHaveBeenCalledTimes(1);
  });

  it("always creates an event log entry regardless of decision", async () => {
    // Test verified path
    createStrictJsonResponseMock.mockResolvedValue({
      outputJson: VALID_COMP_WRITE,
    });

    await memoryWriteGate(
      "123 Main sold for $2.5M",
      { entityId: ENTITY_ID, orgId: ORG_ID },
    );

    expect(recordEventMock).toHaveBeenCalledTimes(1);
    expect(recordEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: ORG_ID,
        entityId: ENTITY_ID,
        status: "attempted",
      }),
    );

    // Test rejected path (OpenAI failure)
    vi.clearAllMocks();
    recordEventMock.mockResolvedValue({ id: "event-log-2" });
    createStrictJsonResponseMock.mockRejectedValue(new Error("fail"));
    prismaMock.memoryRejected.create.mockResolvedValue({ id: "rejected-3" });

    await memoryWriteGate(
      "bad input",
      { entityId: ENTITY_ID, orgId: ORG_ID },
    );

    expect(recordEventMock).toHaveBeenCalledTimes(1);
    expect(recordEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: ORG_ID,
        entityId: ENTITY_ID,
        status: "rejected",
      }),
    );
  });

  it("overrides entity_id with context entityId on valid writes", async () => {
    const writeWithDifferentEntity = {
      ...VALID_COMP_WRITE,
      entity_id: "wrong-entity-id",
    };
    createStrictJsonResponseMock.mockResolvedValue({
      outputJson: writeWithDifferentEntity,
    });

    const result = await memoryWriteGate(
      "123 Main sold for $2.5M",
      { entityId: ENTITY_ID, orgId: ORG_ID },
    );

    expect(result.decision).toBe("verified");
    expect(result.structuredMemoryWrite!.entity_id).toBe(ENTITY_ID);
  });
});
