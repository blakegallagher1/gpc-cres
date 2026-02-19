import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  jurisdictionFindFirstMock,
  dealCreateMock,
  parcelCreateMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  jurisdictionFindFirstMock: vi.fn(),
  dealCreateMock: vi.fn(),
  parcelCreateMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    jurisdiction: {
      findFirst: jurisdictionFindFirstMock,
    },
    deal: {
      create: dealCreateMock,
    },
    parcel: {
      create: parcelCreateMock,
    },
  },
}));

describe("PUT /api/map/prospect", () => {
  let PUT: typeof import("./route").PUT;

  beforeEach(async () => {
    vi.resetModules();
    resolveAuthMock.mockReset();
    jurisdictionFindFirstMock.mockReset();
    dealCreateMock.mockReset();
    parcelCreateMock.mockReset();
    ({ PUT } = await import("./route"));
  });

  it("creates deals on the happy path using org-scoped jurisdictions", async () => {
    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: "org-1" });
    jurisdictionFindFirstMock
      .mockResolvedValueOnce({ id: "jur-default" })
      .mockResolvedValueOnce({ id: "jur-ebr" });
    dealCreateMock.mockResolvedValue({ id: "deal-1" });
    parcelCreateMock.mockResolvedValue({ id: "parcel-1" });

    const req = new NextRequest("http://localhost/api/map/prospect", {
      method: "PUT",
      body: JSON.stringify({
        action: "create-deals",
        parcels: [
          {
            id: "p-1",
            address: "123 Main St",
            lat: 30.45,
            lng: -91.18,
            acreage: 1.5,
            zoning: "C2",
            floodZone: "X",
            parish: "East Baton Rouge",
          },
        ],
      }),
    });

    const res = await PUT(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ created: ["deal-1"], count: 1 });
    expect(jurisdictionFindFirstMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { orgId: "org-1" },
        orderBy: { createdAt: "asc" },
      }),
    );
    expect(jurisdictionFindFirstMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          orgId: "org-1",
          name: { contains: "East Baton Rouge", mode: "insensitive" },
        },
        orderBy: { createdAt: "asc" },
      }),
    );
  });

  it("rejects create-deals when no org-scoped default jurisdiction is available", async () => {
    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: "org-1" });
    jurisdictionFindFirstMock.mockResolvedValue(null);

    const req = new NextRequest("http://localhost/api/map/prospect", {
      method: "PUT",
      body: JSON.stringify({
        action: "create-deals",
        parcels: [
          {
            id: "p-1",
            address: "123 Main St",
            lat: 30.45,
            lng: -91.18,
            acreage: 1.5,
            zoning: "C2",
            floodZone: "X",
            parish: "East Baton Rouge",
          },
        ],
      }),
    });

    const res = await PUT(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toEqual({ error: "No jurisdiction configured" });
    expect(jurisdictionFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orgId: "org-1" },
      }),
    );
    expect(dealCreateMock).not.toHaveBeenCalled();
  });

  it("falls back to the org default jurisdiction when parish-specific lookup misses", async () => {
    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: "org-1" });
    jurisdictionFindFirstMock
      .mockResolvedValueOnce({ id: "jur-default" })
      .mockResolvedValueOnce(null);
    dealCreateMock.mockResolvedValue({ id: "deal-1" });
    parcelCreateMock.mockResolvedValue({ id: "parcel-1" });

    const req = new NextRequest("http://localhost/api/map/prospect", {
      method: "PUT",
      body: JSON.stringify({
        action: "create-deals",
        parcels: [
          {
            id: "p-1",
            address: "123 Main St",
            lat: 30.45,
            lng: -91.18,
            acreage: 1.5,
            zoning: "C2",
            floodZone: "X",
            parish: "Unknown Parish",
          },
        ],
      }),
    });

    const res = await PUT(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ created: ["deal-1"], count: 1 });
    expect(dealCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orgId: "org-1",
          jurisdictionId: "jur-default",
        }),
      }),
    );
    expect(jurisdictionFindFirstMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({ orgId: "org-1" }),
      }),
    );
  });
});
