import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { resolveAuthMock, fetchMock } = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  fetchMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    jurisdiction: { findFirst: vi.fn() },
    deal: { create: vi.fn() },
    parcel: { create: vi.fn() },
  },
}));

describe("POST /api/map/prospect", () => {
  let POST: typeof import("./route").POST;

  beforeEach(async () => {
    vi.resetModules();
    resolveAuthMock.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    process.env.LA_PROPERTY_DB_URL = "https://example.supabase.co";
    process.env.LA_PROPERTY_DB_KEY = "service-role-key";
    ({ POST } = await import("./route"));
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);
    const req = new NextRequest("http://localhost/api/map/prospect", {
      method: "POST",
      body: JSON.stringify({
        polygon: {
          type: "Polygon",
          coordinates: [[[-91.2, 30.4], [-91.2, 30.3], [-91.1, 30.3], [-91.1, 30.4], [-91.2, 30.4]]],
        },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns polygon-filtered parcels on the happy path", async () => {
    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: "org-1" });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: "p-1",
          site_address: "123 Main St",
          owner_name: "Owner",
          acreage: 1.25,
          zoning: "C2",
          flood_zone: "X",
          lat: 30.41,
          lng: -91.15,
          parish: "East Baton Rouge",
          parcel_uid: "uid-1",
        },
      ],
    } as Response);

    const req = new NextRequest("http://localhost/api/map/prospect", {
      method: "POST",
      body: JSON.stringify({
        polygon: {
          type: "Polygon",
          coordinates: [[[-91.2, 30.45], [-91.2, 30.35], [-91.1, 30.35], [-91.1, 30.45], [-91.2, 30.45]]],
        },
        filters: {
          searchText: "Main",
        },
      }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.total).toBeGreaterThan(0);
    expect(body.parcels[0].address).toBe("123 Main St");
  });

  it("returns empty parcels when property DB env is placeholder", async () => {
    process.env.LA_PROPERTY_DB_URL = "placeholder";
    process.env.LA_PROPERTY_DB_KEY = "placeholder";
    ({ POST } = await import("./route"));

    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: "org-1" });
    const req = new NextRequest("http://localhost/api/map/prospect", {
      method: "POST",
      body: JSON.stringify({
        polygon: {
          type: "Polygon",
          coordinates: [[[-91.2, 30.45], [-91.2, 30.35], [-91.1, 30.35], [-91.1, 30.45], [-91.2, 30.45]]],
        },
      }),
    });

    const res = await POST(req);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ parcels: [], total: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
