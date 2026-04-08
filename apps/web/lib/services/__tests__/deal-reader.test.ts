import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDealReaderByIdMock, listDealReadersMock } = vi.hoisted(() => ({
  getDealReaderByIdMock: vi.fn(),
  listDealReadersMock: vi.fn(),
}));

vi.mock("@gpc/server/deals/deal-reader.service", () => ({
  getDealReaderById: getDealReaderByIdMock,
  listDealReaders: listDealReadersMock,
}));

import {
  getDealReaderById,
  listDealReaders,
} from "@/lib/services/deal-reader";

describe("deal-reader service wrapper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns generalized fields when the package service provides them", async () => {
    getDealReaderByIdMock.mockResolvedValue({
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

    const result = await getDealReaderById("org-1", "deal-1");

    expect(getDealReaderByIdMock).toHaveBeenCalledWith("org-1", "deal-1");
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

  it("returns legacy-fallback fields when the package service resolves them", async () => {
    getDealReaderByIdMock.mockResolvedValue({
      id: "deal-2",
      assetClass: "INDUSTRIAL",
      strategy: "ENTITLEMENT",
      opportunityKind: null,
      workflowTemplateKey: "ENTITLEMENT_LAND",
      currentStageKey: "DISPOSITION",
      legacySku: "OUTDOOR_STORAGE",
      legacyStatus: "EXIT_MARKETED",
    });

    const result = await getDealReaderById("org-1", "deal-2");

    expect(getDealReaderByIdMock).toHaveBeenCalledWith("org-1", "deal-2");
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

  it("lists normalized deal readers from the package service", async () => {
    listDealReadersMock.mockResolvedValue([
      {
        id: "deal-3",
        orgId: "org-9",
        assetClass: "INDUSTRIAL",
        strategy: "ENTITLEMENT",
        opportunityKind: null,
        workflowTemplateKey: "ENTITLEMENT_LAND",
        currentStageKey: "SCREENING",
        legacySku: "SMALL_BAY_FLEX",
        legacyStatus: "TRIAGE_DONE",
      },
    ]);

    const result = await listDealReaders({
      orgId: "org-9",
      dealIds: ["deal-3"],
    });

    expect(listDealReadersMock).toHaveBeenCalledWith({
      orgId: "org-9",
      dealIds: ["deal-3"],
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
