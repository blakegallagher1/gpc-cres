import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  listAssetsMock,
  createAssetMock,
  assetValidationErrorMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  listAssetsMock: vi.fn(),
  createAssetMock: vi.fn(),
  assetValidationErrorMock: class AssetValidationError extends Error {},
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@gpc/server", () => ({
  listAssets: listAssetsMock,
  createAsset: createAssetMock,
  AssetValidationError: assetValidationErrorMock,
}));

import { GET, POST } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "99999999-9999-4999-8999-999999999999";

describe("/api/assets route", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    listAssetsMock.mockReset();
    createAssetMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const req = new NextRequest("http://localhost/api/assets");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
    expect(listAssetsMock).not.toHaveBeenCalled();
  });

  it("lists assets scoped to the auth org", async () => {
    listAssetsMock.mockResolvedValue([
      {
        id: "asset-1",
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
      },
    ]);

    const req = new NextRequest("http://localhost/api/assets");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(listAssetsMock).toHaveBeenCalledWith(ORG_ID);
    expect(body.assets).toEqual([
      {
        id: "asset-1",
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
        createdAt: "2026-03-01T00:00:00.000Z",
        updatedAt: "2026-03-02T00:00:00.000Z",
      },
    ]);
  });

  it("creates an asset for the auth org", async () => {
    createAssetMock.mockResolvedValue({
      id: "asset-2",
      orgId: ORG_ID,
      name: "Florida Blvd Storage",
      address: "456 Florida Blvd",
      city: "Baton Rouge",
      state: "LA",
      zip: "70806",
      county: "East Baton Rouge",
      parcelNumber: "APN-2",
      assetClass: "INDUSTRIAL",
      assetSubtype: "Flex",
      lat: 30.448,
      lng: -91.122,
      acreage: 2.1,
      sfGross: 42000,
      sfNet: 39000,
      yearBuilt: 1999,
      zoning: "C2",
      zoningDescription: "Commercial",
      createdAt: new Date("2026-03-03T00:00:00.000Z"),
      updatedAt: new Date("2026-03-03T00:00:00.000Z"),
    });

    const req = new NextRequest("http://localhost/api/assets", {
      method: "POST",
      body: JSON.stringify({
        name: "Florida Blvd Storage",
        address: "456 Florida Blvd",
        city: "Baton Rouge",
        state: "LA",
        zip: "70806",
        county: "East Baton Rouge",
        parcelNumber: "APN-2",
        assetClass: "INDUSTRIAL",
        assetSubtype: "Flex",
        lat: "30.448",
        lng: -91.122,
        acreage: "2.1",
        sfGross: "42000",
        sfNet: 39000,
        yearBuilt: 1999,
        zoning: "C2",
        zoningDescription: "Commercial",
      }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(createAssetMock).toHaveBeenCalledWith(
      ORG_ID,
      expect.objectContaining({
        name: "Florida Blvd Storage",
        assetClass: "INDUSTRIAL",
        lat: "30.448",
        acreage: "2.1",
      }),
    );
    expect(body.asset.id).toBe("asset-2");
    expect(body.asset.orgId).toBe(ORG_ID);
  });

  it("surfaces validation errors from the package seam", async () => {
    createAssetMock.mockRejectedValue(
      new assetValidationErrorMock("name is required"),
    );

    const req = new NextRequest("http://localhost/api/assets", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "name is required" });
  });
});
