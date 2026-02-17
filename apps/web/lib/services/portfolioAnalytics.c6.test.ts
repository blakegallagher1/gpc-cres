import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_ASSUMPTIONS } from "@/stores/financialModelStore";

const { findManyMock } = vi.hoisted(() => ({
  findManyMock: vi.fn(),
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    deal: {
      findMany: findManyMock,
    },
    run: {
      findMany: vi.fn(),
    },
    dealRisk: {
      findMany: vi.fn(),
    },
  },
}));

import { get1031Matches } from "@/lib/services/portfolioAnalytics.service";

describe("portfolioAnalytics C6 1031 deadline wiring", () => {
  beforeEach(() => {
    findManyMock.mockReset();
  });

  it("anchors deadlines to DealTerms.closingDate", async () => {
    const orgId = "11111111-1111-4111-8111-111111111111";
    const dispositionDealId = "22222222-2222-4222-8222-222222222222";

    findManyMock.mockResolvedValue([
      {
        id: dispositionDealId,
        name: "Disposition Deal",
        sku: "SMALL_BAY_FLEX",
        status: "APPROVED",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-02T00:00:00.000Z"),
        jurisdiction: { name: "EBR" },
        parcels: [{ acreage: { toString: () => "2.0" } }],
        terms: { closingDate: new Date("2026-03-15T00:00:00.000Z") },
        financialModelAssumptions: {
          ...DEFAULT_ASSUMPTIONS,
          acquisition: { ...DEFAULT_ASSUMPTIONS.acquisition, purchasePrice: 2_000_000 },
        },
      },
      {
        id: "33333333-3333-4333-8333-333333333333",
        name: "Replacement Deal",
        sku: "OUTDOOR_STORAGE",
        status: "INTAKE",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-02T00:00:00.000Z"),
        jurisdiction: { name: "Ascension" },
        parcels: [{ acreage: { toString: () => "3.0" } }],
        terms: { closingDate: null },
        financialModelAssumptions: {
          ...DEFAULT_ASSUMPTIONS,
          acquisition: { ...DEFAULT_ASSUMPTIONS.acquisition, purchasePrice: 2_200_000 },
        },
      },
    ]);

    const result = await get1031Matches(orgId, dispositionDealId);

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orgId },
      }),
    );
    expect(result.identificationDeadline).toBe("2026-04-29");
    expect(result.closeDeadline).toBe("2026-09-11");
    expect(result.candidates[0]?.identificationDeadline).toBe("2026-04-29");
    expect(result.candidates[0]?.closeDeadline).toBe("2026-09-11");
  });
});
