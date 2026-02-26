import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { resolveAuthMock, fetchMock, getGatewayConfigMock } = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  fetchMock: vi.fn(),
  getGatewayConfigMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@/lib/gateway-proxy", () => ({
  getGatewayConfig: getGatewayConfigMock,
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
    getGatewayConfigMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    // Gateway env vars (used by the route after the PostGIS reroute)
    getGatewayConfigMock.mockReturnValue({
      url: "https://api.gallagherpropco.com",
      key: "test-api-key",
    });
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

  it("returns org-scoped fallback parcels when gateway config is unavailable", async () => {
    // No gateway → falls through to Prisma org parcels
    getGatewayConfigMock.mockReturnValue(null);
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

  // Dev fallback tests removed — isDevParcelFallbackEnabled() permanently returns false.
  // Parcels always use real DB / Property DB / local API.
});
