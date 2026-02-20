import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { resolveAuthMock, fetchMock } = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  fetchMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

const { parcelFindManyMock } = vi.hoisted(() => ({
  parcelFindManyMock: vi.fn(),
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    jurisdiction: { findFirst: vi.fn() },
    deal: { create: vi.fn() },
    parcel: {
      create: vi.fn(),
      findMany: parcelFindManyMock,
    },
  },
}));

describe("POST /api/map/prospect", () => {
  let POST: typeof import("./route").POST;

  beforeEach(async () => {
    vi.resetModules();
    resolveAuthMock.mockReset();
    fetchMock.mockReset();
    parcelFindManyMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
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

  it("returns org-scoped fallback parcels when property DB env is placeholder", async () => {
    process.env.SUPABASE_URL = "placeholder";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder";
    ({ POST } = await import("./route"));

    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: "org-1" });
    parcelFindManyMock.mockResolvedValue([
      {
        id: "local-1",
        address: "1500 Main St",
        acreage: 0.75,
        currentZoning: "C1",
        floodZone: "X",
        lat: 30.4,
        lng: -91.15,
        propertyDbId: null,
      },
    ]);
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
    expect(body.total).toBe(1);
    expect(body.parcels[0].address).toBe("1500 Main St");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed JSON payload", async () => {
    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: "org-1" });
    const req = new NextRequest("http://localhost/api/map/prospect", {
      method: "POST",
      body: "{",
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe("Validation failed");
  });

  it("uses dev fallback parcels when prisma is unreachable in local auth-disabled mode", async () => {
    process.env.SUPABASE_URL = "placeholder";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder";
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.NEXT_PUBLIC_DISABLE_AUTH = "true";
    ({ POST } = await import("./route"));

    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: "org-1" });
    parcelFindManyMock.mockRejectedValue(
      new Error("PrismaClientInitializationError: Can't reach database server"),
    );

    const req = new NextRequest("http://localhost/api/map/prospect", {
      method: "POST",
      body: JSON.stringify({
        polygon: {
          type: "Polygon",
          coordinates: [[[-91.25, 30.5], [-91.25, 30.35], [-91.05, 30.35], [-91.05, 30.5], [-91.25, 30.5]]],
        },
        filters: {
          searchText: "government",
        },
      }),
    });

    const res = await POST(req);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.total).toBeGreaterThan(0);
  });

  it("uses seeded dev parcels when property and org lookups are both empty in local auth-disabled mode", async () => {
    process.env.SUPABASE_URL = "placeholder";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder";
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.NEXT_PUBLIC_DISABLE_AUTH = "true";
    ({ POST } = await import("./route"));

    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: "org-1" });
    parcelFindManyMock.mockResolvedValue([]);

    const req = new NextRequest("http://localhost/api/map/prospect", {
      method: "POST",
      body: JSON.stringify({
        polygon: {
          type: "Polygon",
          coordinates: [[[-91.25, 30.5], [-91.25, 30.35], [-91.05, 30.35], [-91.05, 30.5], [-91.25, 30.5]]],
        },
        filters: {
          searchText: "nonexistent-search-term",
        },
      }),
    });

    const res = await POST(req);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.total).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
