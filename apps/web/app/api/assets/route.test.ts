import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  assetFindManyMock,
  assetCreateMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  assetFindManyMock: vi.fn(),
  assetCreateMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    asset: {
      findMany: assetFindManyMock,
      create: assetCreateMock,
    },
  },
}));

import { GET, POST } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "99999999-9999-4999-8999-999999999999";

describe("/api/assets route", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    assetFindManyMock.mockReset();
    assetCreateMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const req = new NextRequest("http://localhost/api/assets");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
    expect(assetFindManyMock).not.toHaveBeenCalled();
  });

  it("lists assets scoped to the auth org", async () => {
    assetFindManyMock.mockResolvedValue([
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
    expect(assetFindManyMock).toHaveBeenCalledWith({
      where: { orgId: ORG_ID },
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
    });
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
    assetCreateMock.mockResolvedValue({
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
    expect(assetCreateMock).toHaveBeenCalledWith({
      data: {
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
      },
    });
    expect(body.asset.id).toBe("asset-2");
    expect(body.asset.orgId).toBe(ORG_ID);
  });
});
