import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  fetchMock,
  logPropertyDbRuntimeHealthMock,
  getCloudflareAccessHeadersFromEnvMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  fetchMock: vi.fn(),
  logPropertyDbRuntimeHealthMock: vi.fn(),
  getCloudflareAccessHeadersFromEnvMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@/lib/server/propertyDbEnv", () => ({
  logPropertyDbRuntimeHealth: logPropertyDbRuntimeHealthMock,
  getCloudflareAccessHeadersFromEnv: getCloudflareAccessHeadersFromEnvMock,
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

function makeJsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/map/prospect", () => {
  let POST: typeof import("./route").POST;

  beforeEach(async () => {
    vi.resetModules();
    resolveAuthMock.mockReset();
    fetchMock.mockReset();
    parcelFindManyMock.mockReset();
    logPropertyDbRuntimeHealthMock.mockReset();
    getCloudflareAccessHeadersFromEnvMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    // Gateway env vars (used by the route after the PostGIS reroute)
    logPropertyDbRuntimeHealthMock.mockReturnValue({
      url: "https://api.gallagherpropco.com",
      key: "test-api-key",
    });
    getCloudflareAccessHeadersFromEnvMock.mockReturnValue({});
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

  it("returns an empty result when the gateway returns an empty set", async () => {
    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: "org-1" });
    fetchMock.mockResolvedValue(makeJsonResponse([]));
    const req = new NextRequest("http://localhost/api/map/prospect", {
      method: "POST",
      body: JSON.stringify({
        polygon: {
          type: "Polygon",
          coordinates: [[[-91.2, 30.45], [-91.2, 30.35], [-91.1, 30.35], [-91.1, 30.45], [-91.2, 30.45]]],
        },
        filters: { searchText: "Main" },
      }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ parcels: [], total: 0 });
    expect(parcelFindManyMock).not.toHaveBeenCalled();
  });

  it("fails closed when gateway config is unavailable", async () => {
    logPropertyDbRuntimeHealthMock.mockReturnValueOnce(null);
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
    expect(res.status).toBe(503);
    expect(body).toEqual({
      error: "Property database unavailable",
      code: "GATEWAY_UNCONFIGURED",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails closed when the gateway responds with an error", async () => {
    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: "org-1" });
    fetchMock.mockResolvedValue(new Response("bad", { status: 502 }));

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

    expect(res.status).toBe(502);
    expect(body.code).toBe("GATEWAY_UNAVAILABLE");
    expect(parcelFindManyMock).not.toHaveBeenCalled();
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
