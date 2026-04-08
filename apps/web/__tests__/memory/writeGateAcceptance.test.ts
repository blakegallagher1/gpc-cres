import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  prismaMock,
  createStrictJsonResponseMock,
  recordEventMock,
  applyCorrectionMock,
} = vi.hoisted(() => ({
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
  applyCorrectionMock: vi.fn().mockResolvedValue({ id: "correction-record-1" }),
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

vi.mock("@gpc/server/services/memory-event.service", () => ({
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

vi.mock("@gpc/server/services/conflict-detection.service", () => ({
  detectConflicts: vi.fn().mockResolvedValue({
    hasConflict: false,
    conflictingRecords: [],
    conflictKeys: [],
  }),
}));

vi.mock("@/lib/services/correctionService", () => ({
  applyCorrection: applyCorrectionMock,
}));

vi.mock("@gpc/server/services/correction.service", () => ({
  applyCorrection: applyCorrectionMock,
}));

vi.mock("node:crypto", async () => {
  const actual = await vi.importActual<typeof import("node:crypto")>(
    "node:crypto",
  );

  return {
    ...actual,
    randomUUID: () => "test-request-id",
  };
});

import { memoryWriteGate } from "@/lib/services/memoryWriteGate";
import type { MemoryWrite } from "@/lib/schemas/memoryWrite";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const ENTITY_ID = "22222222-2222-4222-8222-222222222222";

describe("writeGateAcceptance — multi fact type", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordEventMock.mockResolvedValue({ id: "event-log-1" });
    prismaMock.memoryVerified.create.mockResolvedValue({ id: "verified-1" });
    prismaMock.memoryVerified.findMany.mockResolvedValue([]);
  });

  it("comp fact type produces CompPayload", async () => {
    const compWrite: MemoryWrite = {
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
    createStrictJsonResponseMock.mockResolvedValue({ outputJson: compWrite });

    const result = await memoryWriteGate("comp sale data", {
      entityId: ENTITY_ID,
      orgId: ORG_ID,
    });

    expect(result.decision).toBe("verified");
    expect(result.structuredMemoryWrite!.fact_type).toBe("comp");
    expect(result.structuredMemoryWrite!.payload).toHaveProperty("sale_price");
    expect(result.structuredMemoryWrite!.payload).toHaveProperty("noi");
  });

  it("lender_term fact type produces LenderTermPayload", async () => {
    const lenderWrite: MemoryWrite = {
      fact_type: "lender_term",
      entity_id: ENTITY_ID,
      source_type: "user",
      timestamp: "2026-02-26T00:00:00Z",
      economic_weight: 0.9,
      volatility_class: "cyclical",
      payload: {
        lender_name: "First National Bank",
        min_dscr: 1.25,
        max_ltv: 0.75,
        rate_type: "fixed",
        rate_bps: 550,
        term_months: 120,
        amortization_months: 300,
        prepayment_penalty: "1% declining",
        recourse: "full",
      },
    };
    createStrictJsonResponseMock.mockResolvedValue({ outputJson: lenderWrite });

    const result = await memoryWriteGate("lender terms from First National", {
      entityId: ENTITY_ID,
      orgId: ORG_ID,
    });

    expect(result.decision).toBe("verified");
    expect(result.structuredMemoryWrite!.fact_type).toBe("lender_term");
    expect(result.structuredMemoryWrite!.payload).toHaveProperty("lender_name", "First National Bank");
    expect(result.structuredMemoryWrite!.payload).toHaveProperty("min_dscr", 1.25);
  });

  it("tour_observation fact type produces TourObservationPayload", async () => {
    const tourWrite: MemoryWrite = {
      fact_type: "tour_observation",
      entity_id: ENTITY_ID,
      source_type: "user",
      timestamp: "2026-02-26T00:00:00Z",
      economic_weight: 0.7,
      volatility_class: "stable",
      payload: {
        observation_date: "2026-02-20",
        condition_rating: 7,
        notes: "Good condition, some deferred maintenance on roof",
        infrastructure_issues: ["roof needs repair", "parking lot cracks"],
        occupancy_estimate: 0.85,
        photo_urls: null,
      },
    };
    createStrictJsonResponseMock.mockResolvedValue({ outputJson: tourWrite });

    const result = await memoryWriteGate("tour notes from site visit", {
      entityId: ENTITY_ID,
      orgId: ORG_ID,
    });

    expect(result.decision).toBe("verified");
    expect(result.structuredMemoryWrite!.fact_type).toBe("tour_observation");
    expect(result.structuredMemoryWrite!.payload).toHaveProperty("condition_rating", 7);
    expect(result.structuredMemoryWrite!.payload).toHaveProperty("infrastructure_issues");
  });

  it("projection fact type produces ProjectionPayload", async () => {
    const projWrite: MemoryWrite = {
      fact_type: "projection",
      entity_id: ENTITY_ID,
      source_type: "agent",
      timestamp: "2026-02-26T00:00:00Z",
      economic_weight: 0.6,
      volatility_class: "high_volatility",
      payload: {
        metric_key: "noi_year_3",
        projected_value: 200000,
        projection_date: "2029-01-01",
        assumptions_json: "{\"growth_rate\":0.03,\"vacancy\":0.05}",
        model_version: "v2.1",
      },
    };
    createStrictJsonResponseMock.mockResolvedValue({ outputJson: projWrite });

    const result = await memoryWriteGate("projected NOI year 3", {
      entityId: ENTITY_ID,
      orgId: ORG_ID,
    });

    expect(result.decision).toBe("verified");
    expect(result.structuredMemoryWrite!.fact_type).toBe("projection");
    expect(result.structuredMemoryWrite!.payload).toHaveProperty("metric_key", "noi_year_3");
    expect(result.structuredMemoryWrite!.payload).toHaveProperty("projected_value", 200000);
  });

  it("correction fact type routes through correction service", async () => {
    const correctionWrite: MemoryWrite = {
      fact_type: "correction",
      entity_id: ENTITY_ID,
      source_type: "correction",
      timestamp: "2026-02-26T00:00:00Z",
      economic_weight: 1.0,
      volatility_class: "stable",
      payload: {
        corrected_attribute_key: "comp.noi",
        corrected_value: 175000,
        correction_reason: "Updated appraisal report",
        corrected_event_id: null,
      },
    };
    createStrictJsonResponseMock.mockResolvedValue({ outputJson: correctionWrite });

    const result = await memoryWriteGate("correct NOI to 175k", {
      entityId: ENTITY_ID,
      orgId: ORG_ID,
    });

    expect(result.decision).toBe("verified");
    expect(result.reasons).toContainEqual(
      expect.stringContaining("Correction fact type"),
    );
    expect(applyCorrectionMock).toHaveBeenCalledWith(
      ENTITY_ID,
      ORG_ID,
      expect.objectContaining({ corrected_attribute_key: "comp.noi" }),
      "event-log-1",
      expect.any(String),
    );
  });

  it("rejects garbage input with clear rejection reasons", async () => {
    createStrictJsonResponseMock.mockRejectedValue(
      new Error("Could not parse structured output"),
    );
    prismaMock.memoryRejected.create.mockResolvedValue({ id: "rejected-1" });

    const result = await memoryWriteGate(
      "askdfjaslkdf junk 12345 !@#$%",
      { entityId: ENTITY_ID, orgId: ORG_ID },
    );

    expect(result.decision).toBe("rejected");
    expect(result.structuredMemoryWrite).toBeNull();
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(result.reasons[0]).toContain("OpenAI structured output failed");
  });

  it("returns eventLogId on all paths", async () => {
    // Verified path
    createStrictJsonResponseMock.mockResolvedValue({
      outputJson: {
        fact_type: "comp",
        entity_id: ENTITY_ID,
        source_type: "agent",
        timestamp: "2026-02-26T00:00:00Z",
        economic_weight: 0.8,
        volatility_class: "cyclical",
        payload: {
          sale_price: 1000000,
          price_per_unit: 50000,
          cap_rate: 7.0,
          noi: 70000,
          pad_count: 10,
          property_type: "retail",
          market: "Baton Rouge",
          sale_date: "2026-01-01",
          source_url: null,
          buyer: null,
          seller: null,
          address: null,
        },
      } satisfies MemoryWrite,
    });

    const verified = await memoryWriteGate("test", {
      entityId: ENTITY_ID,
      orgId: ORG_ID,
    });
    expect(verified.eventLogId).toBeDefined();

    // Rejected path
    vi.clearAllMocks();
    recordEventMock.mockResolvedValue({ id: "event-log-2" });
    createStrictJsonResponseMock.mockRejectedValue(new Error("fail"));
    prismaMock.memoryRejected.create.mockResolvedValue({ id: "rejected-2" });

    const rejected = await memoryWriteGate("garbage", {
      entityId: ENTITY_ID,
      orgId: ORG_ID,
    });
    expect(rejected.eventLogId).toBeDefined();
  });
});
