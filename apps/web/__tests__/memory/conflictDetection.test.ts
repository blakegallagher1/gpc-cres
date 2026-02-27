import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    memoryVerified: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("server-only", () => ({}));

vi.mock("@entitlement-os/db", () => ({
  prisma: prismaMock,
}));

import { detectConflicts } from "@/lib/services/conflictDetection";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const ENTITY_ID = "22222222-2222-4222-8222-222222222222";

describe("detectConflicts", () => {
  beforeEach(() => {
    prismaMock.memoryVerified.findMany.mockReset();
  });

  it("flags conflicting NOI and routes to draft", async () => {
    prismaMock.memoryVerified.findMany.mockResolvedValue([
      {
        id: "existing-1",
        entityId: ENTITY_ID,
        orgId: ORG_ID,
        factType: "comp",
        payloadJson: {
          noi: 150000,
          sale_price: 2500000,
          cap_rate: 6.0,
          pad_count: 20,
        },
        createdAt: new Date("2026-01-01"),
      },
    ]);

    const result = await detectConflicts(ENTITY_ID, ORG_ID, "comp", {
      noi: 162500, // Different from existing 150000
      sale_price: 2500000,
      cap_rate: 6.5, // Different from existing 6.0
      pad_count: 20,
    });

    expect(result.hasConflict).toBe(true);
    expect(result.conflictKeys).toContain("noi");
    expect(result.conflictKeys).toContain("cap_rate");
    expect(result.conflictingRecords).toHaveLength(1);
    expect(result.conflictingRecords[0].id).toBe("existing-1");
  });

  it("no conflict when values match existing verified records", async () => {
    prismaMock.memoryVerified.findMany.mockResolvedValue([
      {
        id: "existing-2",
        entityId: ENTITY_ID,
        orgId: ORG_ID,
        factType: "comp",
        payloadJson: {
          noi: 162500,
          sale_price: 2500000,
          cap_rate: 6.5,
          pad_count: 20,
        },
        createdAt: new Date("2026-01-01"),
      },
    ]);

    const result = await detectConflicts(ENTITY_ID, ORG_ID, "comp", {
      noi: 162500,
      sale_price: 2500000,
      cap_rate: 6.5,
      pad_count: 20,
    });

    expect(result.hasConflict).toBe(false);
    expect(result.conflictKeys).toHaveLength(0);
    expect(result.conflictingRecords).toHaveLength(0);
  });

  it("no conflict when no existing verified records", async () => {
    prismaMock.memoryVerified.findMany.mockResolvedValue([]);

    const result = await detectConflicts(ENTITY_ID, ORG_ID, "comp", {
      noi: 162500,
      sale_price: 2500000,
    });

    expect(result.hasConflict).toBe(false);
    expect(result.conflictKeys).toHaveLength(0);
  });

  it("corrections never trigger conflict detection", async () => {
    const result = await detectConflicts(ENTITY_ID, ORG_ID, "correction", {
      corrected_attribute_key: "comp.noi",
      corrected_value: 175000,
      correction_reason: "Updated appraisal",
    });

    expect(result.hasConflict).toBe(false);
    // Should not even query the database
    expect(prismaMock.memoryVerified.findMany).not.toHaveBeenCalled();
  });

  it("detects lender_term conflicts on min_dscr and max_ltv", async () => {
    prismaMock.memoryVerified.findMany.mockResolvedValue([
      {
        id: "lender-1",
        entityId: ENTITY_ID,
        orgId: ORG_ID,
        factType: "lender_term",
        payloadJson: {
          lender_name: "Bank A",
          min_dscr: 1.25,
          max_ltv: 0.75,
        },
        createdAt: new Date("2026-01-15"),
      },
    ]);

    const result = await detectConflicts(ENTITY_ID, ORG_ID, "lender_term", {
      lender_name: "Bank A",
      min_dscr: 1.20, // Different
      max_ltv: 0.75,
    });

    expect(result.hasConflict).toBe(true);
    expect(result.conflictKeys).toContain("min_dscr");
    expect(result.conflictKeys).not.toContain("max_ltv");
  });

  it("scopes queries by orgId for multi-tenant isolation", async () => {
    prismaMock.memoryVerified.findMany.mockResolvedValue([]);

    await detectConflicts(ENTITY_ID, ORG_ID, "comp", { noi: 100000 });

    expect(prismaMock.memoryVerified.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { entityId: ENTITY_ID, orgId: ORG_ID, factType: "comp" },
      }),
    );
  });
});
