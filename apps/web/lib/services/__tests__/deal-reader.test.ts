import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    prisma: {
      deal: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
    },
  },
}));

vi.mock("@entitlement-os/db", () => dbMock);

import {
  getDealReaderById,
  listDealReaders,
} from "@/lib/services/deal-reader";

describe("deal-reader dual read service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns generalized fields when they are already populated", async () => {
    dbMock.prisma.deal.findFirst.mockResolvedValue({
      id: "deal-1",
      orgId: "org-1",
      name: "Bluebonnet Redevelopment",
      jurisdictionId: "jur-1",
      sku: "TRUCK_PARKING",
      status: "PREAPP",
      assetClass: "LAND",
      strategy: "VALUE_ADD_ACQUISITION",
      opportunityKind: "PROPERTY",
      workflowTemplateKey: "ACQUISITION",
      currentStageKey: "DUE_DILIGENCE",
      legacySku: "TRUCK_PARKING",
      legacyStatus: "PREAPP",
      primaryAssetId: "asset-1",
      createdAt: new Date("2026-03-11T12:00:00.000Z"),
      updatedAt: new Date("2026-03-11T13:00:00.000Z"),
      primaryAsset: {
        id: "asset-1",
        name: "Bluebonnet Site",
        address: "123 Main St",
        parcelNumber: "APN-1",
        assetClass: "LAND",
      },
    });

    const result = await getDealReaderById("org-1", "deal-1");

    expect(dbMock.prisma.deal.findFirst).toHaveBeenCalledWith({
      where: {
        id: "deal-1",
        orgId: "org-1",
      },
      select: expect.any(Object),
    });
    expect(result).toMatchObject({
      id: "deal-1",
      orgId: "org-1",
      assetClass: "LAND",
      strategy: "VALUE_ADD_ACQUISITION",
      opportunityKind: "PROPERTY",
      workflowTemplateKey: "ACQUISITION",
      currentStageKey: "DUE_DILIGENCE",
      legacySku: "TRUCK_PARKING",
      legacyStatus: "PREAPP",
      primaryAssetId: "asset-1",
      primaryAsset: {
        id: "asset-1",
        address: "123 Main St",
      },
    });
  });

  it("falls back to legacy sku and status when generalized fields are null", async () => {
    dbMock.prisma.deal.findFirst.mockResolvedValue({
      id: "deal-2",
      orgId: "org-1",
      name: "Florida Blvd IOS",
      jurisdictionId: "jur-2",
      sku: "OUTDOOR_STORAGE",
      status: "EXIT_MARKETED",
      assetClass: null,
      strategy: null,
      opportunityKind: null,
      workflowTemplateKey: null,
      currentStageKey: null,
      legacySku: null,
      legacyStatus: null,
      primaryAssetId: null,
      createdAt: new Date("2026-03-11T14:00:00.000Z"),
      updatedAt: new Date("2026-03-11T15:00:00.000Z"),
      primaryAsset: null,
    });

    const result = await getDealReaderById("org-1", "deal-2");

    expect(result).toMatchObject({
      id: "deal-2",
      assetClass: "INDUSTRIAL",
      strategy: "ENTITLEMENT",
      opportunityKind: null,
      workflowTemplateKey: "ENTITLEMENT_LAND",
      currentStageKey: "DISPOSITION",
      legacySku: "OUTDOOR_STORAGE",
      legacyStatus: "EXIT_MARKETED",
    });
  });

  it("lists only org-scoped deals and applies the same normalization", async () => {
    dbMock.prisma.deal.findMany.mockResolvedValue([
      {
        id: "deal-3",
        orgId: "org-9",
        name: "Airline Hwy Flex",
        jurisdictionId: "jur-9",
        sku: "SMALL_BAY_FLEX",
        status: "TRIAGE_DONE",
        assetClass: null,
        strategy: null,
        opportunityKind: null,
        workflowTemplateKey: null,
        currentStageKey: null,
        legacySku: null,
        legacyStatus: null,
        primaryAssetId: "asset-3",
        createdAt: new Date("2026-03-11T10:00:00.000Z"),
        updatedAt: new Date("2026-03-11T16:00:00.000Z"),
        primaryAsset: {
          id: "asset-3",
          name: "Airline Hwy Flex",
          address: "456 Airline Hwy",
          parcelNumber: null,
          assetClass: null,
        },
      },
    ]);

    const result = await listDealReaders({
      orgId: "org-9",
      dealIds: ["deal-3"],
    });

    expect(dbMock.prisma.deal.findMany).toHaveBeenCalledWith({
      where: {
        orgId: "org-9",
        id: { in: ["deal-3"] },
      },
      orderBy: { updatedAt: "desc" },
      select: expect.any(Object),
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "deal-3",
      orgId: "org-9",
      assetClass: "INDUSTRIAL",
      strategy: "ENTITLEMENT",
      opportunityKind: null,
      workflowTemplateKey: "ENTITLEMENT_LAND",
      currentStageKey: "SCREENING",
      legacySku: "SMALL_BAY_FLEX",
      legacyStatus: "TRIAGE_DONE",
    });
  });
});
