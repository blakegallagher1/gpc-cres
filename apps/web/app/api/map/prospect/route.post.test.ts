import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  const priorGatewayTimeout = process.env.PROPERTY_DB_GATEWAY_TIMEOUT_MS;

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
    process.env.PROPERTY_DB_GATEWAY_TIMEOUT_MS = "";
    ({ POST } = await import("./route"));
  });

  afterEach(() => {
    process.env.PROPERTY_DB_GATEWAY_TIMEOUT_MS = priorGatewayTimeout;
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
    expect(res.headers.get("x-request-id")).toBeTruthy();
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
    expect(res.headers.get("x-request-id")).toBeTruthy();
    expect(body.total).toBeGreaterThan(0);
    expect(body.parcels[0].address).toBe("123 Main St");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      headers: expect.objectContaining({
        Authorization: "Bearer test-api-key",
        apikey: "test-api-key",
        "Content-Type": "application/json",
        "x-request-id": expect.any(String),
      }),
    });
    const gatewayBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? "{}")) as {
      sql?: string;
      limit?: number;
    };
    expect(gatewayBody.limit).toBe(500);
    expect(gatewayBody.sql).toContain(
      "LOWER(regexp_replace(COALESCE(address, ''), '[^a-z0-9]+', ' ', 'g')) LIKE '%main%' ESCAPE '\\'",
    );
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
    expect(res.headers.get("x-request-id")).toBeTruthy();
    expect(body).toEqual({ parcels: [], total: 0 });
    expect(parcelFindManyMock).not.toHaveBeenCalled();
  });

  it("maps wrapped gateway rows nested under data.rows", async () => {
    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: "org-1" });
    fetchMock.mockResolvedValue(
      makeJsonResponse({
        ok: true,
        data: {
          rows: [
            {
              id: "p-2",
              site_address: "456 Oak Ave",
              owner_name: "Wrapped Owner",
              acreage: 2.5,
              zoning: "M1",
              assessed_value: 750000,
              lat: 30.4,
              lng: -91.16,
              parish_name: "East Baton Rouge",
              parcel_uid: "uid-2",
            },
          ],
        },
      }),
    );

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
    expect(body).toEqual({
      parcels: [
        {
          id: "p-2",
          address: "456 Oak Ave",
          owner: "Wrapped Owner",
          acreage: 2.5,
          zoning: "M1",
          assessedValue: 750000,
          floodZone: "",
          lat: 30.4,
          lng: -91.16,
          parish: "East Baton Rouge",
          parcelUid: "uid-2",
          propertyDbId: "uid-2",
        },
      ],
      total: 1,
    });
  });

  it("maps columnar gateway SQL responses", async () => {
    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: "org-1" });
    fetchMock.mockResolvedValue(
      makeJsonResponse({
        columnNames: [
          "id",
          "site_address",
          "owner_name",
          "acreage",
          "zoning",
          "assessed_value",
          "lat",
          "lng",
          "parish_name",
          "parcel_id",
        ],
        rows: [
          [
            "p-3",
            "2774 HIGHLAND RD",
            "Columnar Owner",
            1.1,
            "C2",
            640000,
            30.4227,
            -91.179,
            "East Baton Rouge",
            "parcel-3",
          ],
        ],
        rowCount: 1,
      }),
    );

    const req = new NextRequest("http://localhost/api/map/prospect", {
      method: "POST",
      body: JSON.stringify({
        polygon: {
          type: "Polygon",
          coordinates: [[[-91.2, 30.45], [-91.2, 30.35], [-91.1, 30.35], [-91.1, 30.45], [-91.2, 30.45]]],
        },
        filters: { searchText: "2774 HIGHLAND RD" },
      }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      parcels: [
        {
          id: "p-3",
          address: "2774 HIGHLAND RD",
          owner: "Columnar Owner",
          acreage: 1.1,
          zoning: "C2",
          assessedValue: 640000,
          floodZone: "",
          lat: 30.4227,
          lng: -91.179,
          parish: "East Baton Rouge",
          parcelUid: "parcel-3",
          propertyDbId: "parcel-3",
        },
      ],
      total: 1,
    });
  });

  it("adds suffix-aware searchText matching to the polygon SQL", async () => {
    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: "org-1" });
    fetchMock.mockResolvedValue(makeJsonResponse([]));

    const req = new NextRequest("http://localhost/api/map/prospect", {
      method: "POST",
      body: JSON.stringify({
        polygon: {
          type: "Polygon",
          coordinates: [[[-91.2, 30.45], [-91.2, 30.35], [-91.1, 30.35], [-91.1, 30.45], [-91.2, 30.45]]],
        },
        filters: { searchText: "2774 Highland Rd" },
      }),
    });

    const res = await POST(req);
    const gatewayBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? "{}")) as {
      sql?: string;
    };

    expect(res.status).toBe(200);
    expect(gatewayBody.sql).toContain("%2774%highland%rd%");
    expect(gatewayBody.sql).toContain("%2774%highland%road%");
  });

  it("treats wildcard-only searchText as an unfiltered polygon search", async () => {
    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: "org-1" });
    fetchMock.mockResolvedValue(makeJsonResponse([]));

    const req = new NextRequest("http://localhost/api/map/prospect", {
      method: "POST",
      body: JSON.stringify({
        polygon: {
          type: "Polygon",
          coordinates: [[[-91.2, 30.45], [-91.2, 30.35], [-91.1, 30.35], [-91.1, 30.45], [-91.2, 30.45]]],
        },
        filters: { searchText: "*" },
      }),
    });

    const res = await POST(req);
    const gatewayBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? "{}")) as {
      sql?: string;
    };

    expect(res.status).toBe(200);
    expect(gatewayBody.sql).not.toContain("regexp_replace(COALESCE(address");
    expect(gatewayBody.sql).not.toContain("%\\*%");
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
    expect(res.headers.get("x-request-id")).toBeTruthy();
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
    expect(res.headers.get("x-request-id")).toBeTruthy();
    expect(body.code).toBe("GATEWAY_UNAVAILABLE");
    expect(parcelFindManyMock).not.toHaveBeenCalled();
  });

  it("fails closed when the gateway request times out", async () => {
    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: "org-1" });
    process.env.PROPERTY_DB_GATEWAY_TIMEOUT_MS = "987";
    const abortError = Object.assign(new Error("aborted"), {
      name: "AbortError",
    });
    fetchMock.mockRejectedValue(abortError);

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
      code: "GATEWAY_UNAVAILABLE",
    });
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
    expect(res.headers.get("x-request-id")).toBeTruthy();
    expect(body.error).toBe("Validation failed");
  });

  // Dev fallback tests removed — isDevParcelFallbackEnabled() permanently returns false.
  // Parcels always use real DB / Property DB / local API.
});
