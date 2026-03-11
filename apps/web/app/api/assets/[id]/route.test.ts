import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  assetFindFirstMock,
  assetUpdateMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  assetFindFirstMock: vi.fn(),
  assetUpdateMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    asset: {
      findFirst: assetFindFirstMock,
      update: assetUpdateMock,
    },
  },
}));

import { GET, PATCH } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "99999999-9999-4999-8999-999999999999";
const ASSET_ID = "asset-1";
const DEAL_ID = "deal-1";

describe("/api/assets/[id] route", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    assetFindFirstMock.mockReset();
    assetUpdateMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const req = new NextRequest(`http://localhost/api/assets/${ASSET_ID}`);
    const res = await GET(req, { params: Promise.resolve({ id: ASSET_ID }) });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
    expect(assetFindFirstMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the asset is outside the auth org", async () => {
    assetFindFirstMock.mockResolvedValue(null);

    const req = new NextRequest(`http://localhost/api/assets/${ASSET_ID}`);
    const res = await GET(req, { params: Promise.resolve({ id: ASSET_ID }) });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body).toEqual({ error: "Asset not found" });
    expect(assetFindFirstMock).toHaveBeenCalledWith({
      where: { id: ASSET_ID, orgId: ORG_ID },
      include: {
        dealAssets: {
          orderBy: { createdAt: "asc" },
          include: {
            deal: {
              select: {
                id: true,
                name: true,
                sku: true,
                status: true,
                legacySku: true,
                legacyStatus: true,
                assetClass: true,
                strategy: true,
                workflowTemplateKey: true,
                currentStageKey: true,
              },
            },
          },
        },
      },
    });
  });

  it("returns the asset with deal associations for the auth org", async () => {
    assetFindFirstMock.mockResolvedValue({
      id: ASSET_ID,
      orgId: ORG_ID,
      name: "Perkins Yard",
      address: "123 Main St",
      city: "Baton Rouge",
      state: "LA",
      zip: "70801",
      county: "East Baton Rouge",
      parcelNumber: "APN-1",
      assetClass: "LAND",
      assetSubtype: "Industrial Outdoor Storage",
      lat: 30.4515,
      lng: -91.1871,
      acreage: 4.2,
      sfGross: null,
      sfNet: null,
      yearBuilt: null,
      zoning: "M1",
      zoningDescription: "Industrial",
      createdAt: new Date("2026-03-01T00:00:00.000Z"),
      updatedAt: new Date("2026-03-02T00:00:00.000Z"),
      dealAssets: [
        {
          id: "deal-asset-1",
          orgId: ORG_ID,
          dealId: DEAL_ID,
          assetId: ASSET_ID,
          role: "PRIMARY",
          createdAt: new Date("2026-03-02T00:00:00.000Z"),
          deal: {
            id: DEAL_ID,
            name: "Opportunity 1",
            sku: "SMALL_BAY_FLEX",
            status: "TRIAGE_DONE",
            legacySku: "SMALL_BAY_FLEX",
            legacyStatus: "TRIAGE_DONE",
            assetClass: "INDUSTRIAL",
            strategy: "ENTITLEMENT",
            workflowTemplateKey: "ENTITLEMENT_LAND",
            currentStageKey: "SCREENING",
          },
        },
      ],
    });

    const req = new NextRequest(`http://localhost/api/assets/${ASSET_ID}`);
    const res = await GET(req, { params: Promise.resolve({ id: ASSET_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.asset.id).toBe(ASSET_ID);
    expect(body.asset.dealAssociations).toEqual([
      {
        id: "deal-asset-1",
        orgId: ORG_ID,
        dealId: DEAL_ID,
        assetId: ASSET_ID,
        role: "PRIMARY",
        createdAt: "2026-03-02T00:00:00.000Z",
        deal: {
          id: DEAL_ID,
          name: "Opportunity 1",
          sku: "SMALL_BAY_FLEX",
          status: "TRIAGE_DONE",
          legacySku: "SMALL_BAY_FLEX",
          legacyStatus: "TRIAGE_DONE",
          assetClass: "INDUSTRIAL",
          strategy: "ENTITLEMENT",
          workflowTemplateKey: "ENTITLEMENT_LAND",
          currentStageKey: "SCREENING",
        },
      },
    ]);
  });

  it("updates only the scoped asset", async () => {
    assetFindFirstMock.mockResolvedValueOnce({ id: ASSET_ID });
    assetUpdateMock.mockResolvedValue({
      id: ASSET_ID,
      orgId: ORG_ID,
      name: "Updated Yard",
      address: "123 Main St",
      city: "Baton Rouge",
      state: "LA",
      zip: "70801",
      county: "East Baton Rouge",
      parcelNumber: "APN-1",
      assetClass: "LAND",
      assetSubtype: "Yard",
      lat: 30.25,
      lng: -91.11,
      acreage: 5,
      sfGross: null,
      sfNet: null,
      yearBuilt: null,
      zoning: "M2",
      zoningDescription: "Heavy industrial",
      createdAt: new Date("2026-03-01T00:00:00.000Z"),
      updatedAt: new Date("2026-03-04T00:00:00.000Z"),
    });

    const req = new NextRequest(`http://localhost/api/assets/${ASSET_ID}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: "Updated Yard",
        lat: "30.25",
        acreage: "5",
        zoning: "M2",
      }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: ASSET_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(assetUpdateMock).toHaveBeenCalledWith({
      where: { id: ASSET_ID },
      data: {
        name: "Updated Yard",
        lat: 30.25,
        acreage: 5,
        zoning: "M2",
      },
    });
    expect(body.asset).toMatchObject({
      id: ASSET_ID,
      name: "Updated Yard",
      lat: 30.25,
      acreage: 5,
      zoning: "M2",
    });
  });
});
