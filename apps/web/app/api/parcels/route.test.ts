import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  findManyMock,
  logPropertyDbRuntimeHealthMock,
  requireGatewayConfigMock,
  isPrismaConnectivityErrorMock,
  requestPropertyDbGatewayMock,
} = vi.hoisted(() => {
  return {
    resolveAuthMock: vi.fn(),
    findManyMock: vi.fn(),
    logPropertyDbRuntimeHealthMock: vi.fn(),
    requireGatewayConfigMock: vi.fn(),
    isPrismaConnectivityErrorMock: vi.fn().mockReturnValue(false),
    requestPropertyDbGatewayMock: vi.fn(),
  };
});

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@entitlement-os/db", () => ({
  prismaRead: {
    parcel: {
      findMany: findManyMock,
    },
  },
}));

vi.mock("@/lib/server/propertyDbEnv", () => ({
  logPropertyDbRuntimeHealth: logPropertyDbRuntimeHealthMock,
  getCloudflareAccessHeadersFromEnv: vi.fn(() => ({})),
  requireGatewayConfig: requireGatewayConfigMock,
}));

vi.mock("@/lib/server/devParcelFallback", () => ({
  isPrismaConnectivityError: isPrismaConnectivityErrorMock,
}));

vi.mock("@/lib/server/propertyDbRpc", () => ({
  requestPropertyDbGateway: requestPropertyDbGatewayMock,
}));

function createJsonResponse(payload: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function mockGatewaySearchRows(
  rows: unknown[] | ((query: string) => unknown[] | Promise<unknown[]>),
): { attemptedQueries: string[] } {
  const attemptedQueries: string[] = [];
  requestPropertyDbGatewayMock.mockImplementation(async (params: { path: string }) => {
    const url = new URL(params.path, "http://gateway.test");
    const query = url.searchParams.get("q") ?? "";
    attemptedQueries.push(query);
    const resolvedRows = typeof rows === "function" ? await rows(query) : rows;
    return createJsonResponse(resolvedRows);
  });
  return { attemptedQueries };
}

describe("GET /api/parcels", () => {
  let GET: typeof import("./route").GET;

  beforeEach(() => {
    vi.resetModules();
    resolveAuthMock.mockReset();
    findManyMock.mockReset();
    logPropertyDbRuntimeHealthMock.mockReset();
    requireGatewayConfigMock.mockReset();
    isPrismaConnectivityErrorMock.mockReset();
    isPrismaConnectivityErrorMock.mockReturnValue(false);
    requestPropertyDbGatewayMock.mockReset();
    process.env.LOCAL_API_URL = "http://property-db.test";
    process.env.LOCAL_API_KEY = "test-key";
    process.env.GATEWAY_PROXY_URL = "http://gateway.test";
    process.env.GATEWAY_PROXY_TOKEN = "test-gateway-token";
    requireGatewayConfigMock.mockImplementation(() => {
      const url = process.env.LOCAL_API_URL?.trim();
      const key = process.env.LOCAL_API_KEY?.trim();
      if (!url || !key) {
        throw new Error("missing gateway config");
      }
      return { url, key };
    });
    logPropertyDbRuntimeHealthMock.mockImplementation(() => {
      const url = process.env.LOCAL_API_URL?.trim();
      const key = process.env.LOCAL_API_KEY?.trim();
      if (!url || !key) return null;
      return { url, key };
    });
    requestPropertyDbGatewayMock.mockResolvedValue(createJsonResponse([]));
  });

  it("returns 401 when unauthenticated", async () => {
    ({ GET } = await import("./route"));
    resolveAuthMock.mockResolvedValue(null);
    const req = new NextRequest("http://localhost/api/parcels?hasCoords=true");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(res.headers.get("x-request-id")).toBeTruthy();
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("returns org-scoped parcels when no filters are provided", async () => {
    ({ GET } = await import("./route"));
    resolveAuthMock.mockResolvedValue({
      userId: "99999999-9999-4999-8999-999999999999",
      orgId: "11111111-1111-4111-8111-111111111111",
    });
    findManyMock.mockResolvedValue([
      {
        id: "parcel-1",
        address: "123 Main St",
        lat: 30.45,
        lng: -91.18,
        owner: "Owner LLC",
        acreage: 1.2,
        floodZone: "X",
        currentZoning: "C2",
        propertyDbId: "uid-1",
        deal: null,
      },
    ]);

    const req = new NextRequest("http://localhost/api/parcels");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.source).toBe("org");
    expect(res.headers.get("x-request-id")).toBeTruthy();
    expect(body.parcels).toHaveLength(1);
    expect(body.parcels[0].id).toBe("UID1");
    expect(body.parcels[0].parcelId).toBe("UID1");
    expect(body.parcels[0].owner).toBe("Owner LLC");
    expect(findManyMock).toHaveBeenCalledTimes(1);
    expect(requestPropertyDbGatewayMock).not.toHaveBeenCalled();
  });

  it("returns 503 when org parcel store is unavailable", async () => {
    ({ GET } = await import("./route"));
    resolveAuthMock.mockResolvedValue({
      userId: "99999999-9999-4999-8999-999999999999",
      orgId: "11111111-1111-4111-8111-111111111111",
    });
    isPrismaConnectivityErrorMock.mockReturnValueOnce(true);
    findManyMock.mockRejectedValueOnce(new Error("connection lost"));

    const req = new NextRequest("http://localhost/api/parcels");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body).toEqual({
      error: "Parcel store unavailable",
      code: "ORG_DATA_UNAVAILABLE",
    });
    expect(requestPropertyDbGatewayMock).not.toHaveBeenCalled();
  });

  it("returns property-db results when gateway search returns parcels", async () => {
    ({ GET } = await import("./route"));
    resolveAuthMock.mockResolvedValue({
      userId: "99999999-9999-4999-8999-999999999999",
      orgId: "11111111-1111-4111-8111-111111111111",
    });
    findManyMock.mockResolvedValue([]);
    mockGatewaySearchRows([
      {
        id: "external-1",
        site_address: "456 River Rd",
        latitude: 30.41,
        longitude: -91.09,
        owner: "River Holdings",
        acreage: 3.4,
        flood_zone: "AE",
        zone_code: "I1",
        parcel_uid: "parcel-uid-1",
      },
    ]);

    const req = new NextRequest("http://localhost/api/parcels?hasCoords=true");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.source).toBe("property-db");
    expect(body.parcels.length).toBeGreaterThan(0);
    expect(body.parcels[0].propertyDbId).toBe("parcel-uid-1");
    expect(body.parcels[0].geometryLookupKey).toBe("parcel-uid-1");
    expect(body.parcels[0].parcelId).toBe("PARCELUID1");
    expect(body.parcels[0].owner).toBe("River Holdings");
  });

  it("stops gateway search fallbacks after the first non-empty search hit", async () => {
    ({ GET } = await import("./route"));
    resolveAuthMock.mockResolvedValue({
      userId: "99999999-9999-4999-8999-999999999999",
      orgId: "11111111-1111-4111-8111-111111111111",
    });
    findManyMock.mockResolvedValue([]);
    const { attemptedQueries } = mockGatewaySearchRows([
        {
          id: "external-search-1",
          site_address: "4416 Heath Dr",
          lat: 30.60188,
          lng: -91.15151,
          owner: "Heath Trust",
          acreage: 0.23,
          parcel_uid: "search-uid-1",
        },
    ]);

    const req = new NextRequest("http://localhost/api/parcels?search=4416%20HEATH%20DR");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.source).toBe("property-db");
    expect(body.parcels).toHaveLength(1);
    expect(attemptedQueries.length).toBeGreaterThan(0);
  });

  it("parses gateway-backed parcel rows from JSON responses", async () => {
    ({ GET } = await import("./route"));
    resolveAuthMock.mockResolvedValue({
      userId: "99999999-9999-4999-8999-999999999999",
      orgId: "11111111-1111-4111-8111-111111111111",
    });
    findManyMock.mockResolvedValue([]);
    requestPropertyDbGatewayMock.mockResolvedValue(
      createJsonResponse({
        data: [
        {
          id: "external-json-1",
          site_address: "2774 Highland Rd",
          lat: 30.4228,
          lng: -91.179,
          owner: "Highland Holdings",
          acreage: 0.11,
          parcel_uid: "json-uid-1",
        },
        ],
        source: "gateway",
        staleness_seconds: null,
      }),
    );

    const req = new NextRequest("http://localhost/api/parcels?hasCoords=true");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.source).toBe("property-db");
    expect(body.parcels[0].propertyDbId).toBe("json-uid-1");
    expect(body.parcels[0].parcelId).toBe("JSONUID1");
  });

  it("returns degraded org fallback when gateway config is unavailable for gateway-backed parcel queries", async () => {
    logPropertyDbRuntimeHealthMock.mockReturnValueOnce(null);
    ({ GET } = await import("./route"));
    resolveAuthMock.mockResolvedValue({
      userId: "99999999-9999-4999-8999-999999999999",
      orgId: "11111111-1111-4111-8111-111111111111",
    });
    findManyMock.mockResolvedValue([]);

    const req = new NextRequest("http://localhost/api/parcels?hasCoords=true");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.source).toBe("org-fallback");
    expect(body.degraded).toBe(true);
    expect(requestPropertyDbGatewayMock).not.toHaveBeenCalled();
  });

  it("maps property-db rows that only provide geom_simplified geometry", async () => {
    ({ GET } = await import("./route"));
    resolveAuthMock.mockResolvedValue({
      userId: "99999999-9999-4999-8999-999999999999",
      orgId: "11111111-1111-4111-8111-111111111111",
    });
    findManyMock.mockResolvedValue([]);
    mockGatewaySearchRows([
          {
            id: "external-geom-only-1",
            site_address: "3154 College Dr, Baton Rouge, LA",
            geom_simplified: {
              type: "Polygon",
              coordinates: [
                [
                  [-91.149, 30.414],
                  [-91.1485, 30.414],
                  [-91.1485, 30.4145],
                  [-91.149, 30.4145],
                  [-91.149, 30.414],
                ],
              ],
            },
          },
    ]);

    const req = new NextRequest("http://localhost/api/parcels?hasCoords=true&search=3154+college+drive%2C+baton+rouge%2C+la");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.source).toBe("property-db");
    expect(body.parcels.length).toBeGreaterThan(0);
    expect(body.parcels[0].lat).toBeTypeOf("number");
    expect(body.parcels[0].lng).toBeTypeOf("number");
  });

  it("maps property-db rows when geom_simplified is a JSON string", async () => {
    ({ GET } = await import("./route"));
    resolveAuthMock.mockResolvedValue({
      userId: "99999999-9999-4999-8999-999999999999",
      orgId: "11111111-1111-4111-8111-111111111111",
    });
    findManyMock.mockResolvedValue([]);
    mockGatewaySearchRows([
          {
            id: "external-geom-string-1",
            site_address: "3154 College Dr, Baton Rouge, LA",
            geom_simplified: JSON.stringify({
              type: "Polygon",
              coordinates: [
                [
                  [-91.149, 30.414],
                  [-91.1485, 30.414],
                  [-91.1485, 30.4145],
                  [-91.149, 30.4145],
                  [-91.149, 30.414],
                ],
              ],
            }),
          },
    ]);

    const req = new NextRequest("http://localhost/api/parcels?hasCoords=true&search=3154+college+drive%2C+baton+rouge%2C+la");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.source).toBe("property-db");
    expect(body.parcels.length).toBeGreaterThan(0);
    expect(body.parcels[0].lat).toBeTypeOf("number");
    expect(body.parcels[0].lng).toBeTypeOf("number");
  });

  it("uses LOCAL_API_URL and LOCAL_API_KEY for property-db requests", async () => {
    ({ GET } = await import("./route"));
    process.env.LOCAL_API_URL = "http://property-db.test";
    process.env.LOCAL_API_KEY = "service-role-key";
    resolveAuthMock.mockResolvedValue({
      userId: "99999999-9999-4999-8999-999999999999",
      orgId: "11111111-1111-4111-8111-111111111111",
    });
    findManyMock.mockResolvedValue([]);
    mockGatewaySearchRows([
          {
            id: "fallback-1",
            site_address: "123 Fallback St",
            latitude: 30.4,
            longitude: -91.1,
            acreage: 1.1,
            flood_zone: "X",
            zone_code: "C2",
            parcel_uid: "uid-fallback-1",
          },
    ]);

    const req = new NextRequest("http://localhost/api/parcels?hasCoords=true");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.source).toBe("property-db");
    expect(body.parcels.length).toBeGreaterThan(0);
    expect(requestPropertyDbGatewayMock).toHaveBeenCalled();
  });

  it("returns org fallback parcels when property-db gateway rejects all requests", async () => {
    ({ GET } = await import("./route"));
    resolveAuthMock.mockResolvedValue({
      userId: "99999999-9999-4999-8999-999999999999",
      orgId: "11111111-1111-4111-8111-111111111111",
    });
    findManyMock.mockResolvedValue([
      {
        id: "org-fallback-1",
        address: "123 Org Fallback St",
        lat: 30.45,
        lng: -91.19,
        acreage: 1.5,
        floodZone: "X",
        currentZoning: "C2",
        propertyDbId: "org-fallback-uid-1",
        deal: null,
      },
    ]);
    requestPropertyDbGatewayMock.mockRejectedValue(new Error("network failure"));

    const req = new NextRequest("http://localhost/api/parcels?hasCoords=true&search=123");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.source).toBe("org-fallback");
    expect(body.degraded).toBe(true);
    expect(Array.isArray(body.parcels)).toBe(true);
    expect(body.parcels.length).toBeGreaterThan(0);
    expect(body.parcels[0].parcelId).toBe("ORGFALLBACKUID1");
  });

  it("suppresses out-of-region gateway parcels from Baton Rouge map searches", async () => {
    ({ GET } = await import("./route"));
    resolveAuthMock.mockResolvedValue({
      userId: "99999999-9999-4999-8999-999999999999",
      orgId: "11111111-1111-4111-8111-111111111111",
    });
    findManyMock.mockResolvedValue([]);
    mockGatewaySearchRows([
          {
            id: "park-county-1",
            site_address: "123 Elk Run Rd, Park County, Colorado",
            latitude: 39.12,
            longitude: -105.58,
            parcel_uid: "pc-1",
          },
    ]);

    const req = new NextRequest("http://localhost/api/parcels?search=elk");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.parcels).toEqual([]);
  });

  it("caps gateway fallback fanout for search requests", async () => {
    ({ GET } = await import("./route"));
    resolveAuthMock.mockResolvedValue({
      userId: "99999999-9999-4999-8999-999999999999",
      orgId: "11111111-1111-4111-8111-111111111111",
    });
    findManyMock.mockResolvedValue([]);
    const { attemptedQueries } = mockGatewaySearchRows([]);

    const req = new NextRequest(
      "http://localhost/api/parcels?hasCoords=true&search=1234+Long+Address+Name+Baton+Rouge+Louisiana",
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(attemptedQueries.length).toBeLessThanOrEqual(8);
  });

  it("prioritizes exact suffix-preserving address variants ahead of canonicalized fallback queries", async () => {
    ({ GET } = await import("./route"));
    resolveAuthMock.mockResolvedValue({
      userId: "99999999-9999-4999-8999-999999999999",
      orgId: "11111111-1111-4111-8111-111111111111",
    });
    findManyMock.mockResolvedValue([]);
    const { attemptedQueries } = mockGatewaySearchRows([]);

    const req = new NextRequest("http://localhost/api/parcels?hasCoords=true&search=4416+HEATH+DR");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(attemptedQueries.slice(0, 2)).toEqual(["4416 HEATH DR", "4416 heath"]);
  });

  it("keeps the default gateway timeout high enough for slower successful gateway responses", async () => {
    vi.useFakeTimers();

    try {
      ({ GET } = await import("./route"));
      logPropertyDbRuntimeHealthMock.mockReturnValue({
        url: "http://property-db.test",
        key: "test-key",
      });
      requireGatewayConfigMock.mockReturnValue({
        url: "http://property-db.test",
        key: "test-key",
      });
      resolveAuthMock.mockResolvedValue({
        userId: "99999999-9999-4999-8999-999999999999",
        orgId: "11111111-1111-4111-8111-111111111111",
      });
      findManyMock.mockResolvedValue([]);
      requestPropertyDbGatewayMock.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve(
                createJsonResponse([
                  {
                    id: "external-slow-1",
                    site_address: "4416 Heath Dr",
                    latitude: 30.45,
                    longitude: -91.12,
                    acreage: 0.7,
                    flood_zone: "X",
                    zone_code: "C2",
                    parcel_uid: "parcel-uid-slow-1",
                  },
                ]),
              );
            }, 7500);
          }),
      );

      const req = new NextRequest("http://localhost/api/parcels?hasCoords=true");
      const pending = GET(req);
      await vi.advanceTimersByTimeAsync(7600);
      const res = await pending;
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.source).toBe("property-db");
      expect(body.parcels[0].address).toBe("4416 Heath Dr");
    } finally {
      vi.useRealTimers();
    }
  });

  it("logs the configured timeout duration when gateway search aborts", async () => {
    vi.useFakeTimers();
    process.env.PROPERTY_DB_GATEWAY_TIMEOUT_MS = "1500";
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      ({ GET } = await import("./route"));
      resolveAuthMock.mockResolvedValue({
        userId: "99999999-9999-4999-8999-999999999999",
        orgId: "11111111-1111-4111-8111-111111111111",
      });
      findManyMock.mockRejectedValue(new Error("db unavailable"));
      requestPropertyDbGatewayMock.mockImplementation(() => {
        const error = new Error("request timed out after 1500ms");
        error.name = "AbortError";
        return Promise.reject(error);
      });

      const req = new NextRequest("http://localhost/api/parcels?hasCoords=true");
      const pending = GET(req);
      await vi.advanceTimersByTimeAsync(3200);
      const res = await pending;
      const body = await res.json();

      expect(res.status).toBe(503);
      expect(body).toEqual({
        error: "Property database unavailable",
        code: "GATEWAY_UNAVAILABLE",
      });

      const timeoutLog = consoleErrorSpy.mock.calls.find((call) =>
        String(call[0]).includes("[/api/parcels] property DB unavailable") &&
        call[1] instanceof Error &&
        call[1].message.includes("request timed out after 1500ms"),
      );
      expect(timeoutLog).toBeTruthy();
    } finally {
      delete process.env.PROPERTY_DB_GATEWAY_TIMEOUT_MS;
      consoleErrorSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("caps baseline gateway fanout for non-search map loads", async () => {
    ({ GET } = await import("./route"));
    resolveAuthMock.mockResolvedValue({
      userId: "99999999-9999-4999-8999-999999999999",
      orgId: "11111111-1111-4111-8111-111111111111",
    });
    findManyMock.mockResolvedValue([]);
    const { attemptedQueries } = mockGatewaySearchRows([]);

    const req = new NextRequest("http://localhost/api/parcels?hasCoords=true");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(attemptedQueries.length).toBeLessThanOrEqual(4);
  });

  it("returns org-scoped search matches when property-db search returns no rows", async () => {
    ({ GET } = await import("./route"));
    resolveAuthMock.mockResolvedValue({
      userId: "99999999-9999-4999-8999-999999999999",
      orgId: "11111111-1111-4111-8111-111111111111",
    });
    findManyMock.mockResolvedValue([
      {
        id: "org-parcel-1",
        address: "7618 Copperfield Court, Baton Rouge, LA",
        lat: 30.421,
        lng: -91.102,
        acreage: 0.4,
        floodZone: "X",
        currentZoning: "A1",
        propertyDbId: null,
        deal: null,
      },
    ]);
    mockGatewaySearchRows([]);

    const req = new NextRequest(
      "http://localhost/api/parcels?hasCoords=true&search=7618+copperfield+ct",
    );
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.source).toBe("org");
    expect(body.degraded).toBe(true);
    expect(body.parcels.length).toBeGreaterThan(0);
    expect(body.parcels[0].address).toContain("Copperfield");
  });

  it("uses LOCAL_API_URL for property-db searches when set", async () => {
    ({ GET } = await import("./route"));
    process.env.LOCAL_API_URL = "http://property-db.test";
    process.env.LOCAL_API_KEY = "service-role-key";
    resolveAuthMock.mockResolvedValue({
      userId: "99999999-9999-4999-8999-999999999999",
      orgId: "11111111-1111-4111-8111-111111111111",
    });
    findManyMock.mockResolvedValue([]);
    mockGatewaySearchRows([
          {
            id: "fallback-2",
            site_address: "456 Fallback Ave",
            latitude: 30.41,
            longitude: -91.11,
            acreage: 2.2,
            flood_zone: "X",
            zone_code: "C1",
            parcel_uid: "uid-fallback-2",
          },
    ]);

    const req = new NextRequest("http://localhost/api/parcels?hasCoords=true");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.source).toBe("property-db");
    expect(body.parcels.length).toBeGreaterThan(0);
    expect(requestPropertyDbGatewayMock).toHaveBeenCalled();
  });

  it("uses org fallback when gateway config is missing", async () => {
    ({ GET } = await import("./route"));
    logPropertyDbRuntimeHealthMock.mockReturnValueOnce(null);
    requireGatewayConfigMock.mockImplementation(() => {
      throw new Error("missing gateway config");
    });

    resolveAuthMock.mockResolvedValue({
      userId: "99999999-9999-4999-8999-999999999999",
      orgId: "11111111-1111-4111-8111-111111111111",
    });
    findManyMock.mockResolvedValue([
      {
        id: "org-fallback-2",
        address: "456 Org Fallback Ave",
        lat: 30.41,
        lng: -91.11,
        acreage: 2.2,
        floodZone: "X",
        currentZoning: "C1",
        propertyDbId: "org-fallback-uid-2",
        deal: null,
      },
    ]);

    const req = new NextRequest("http://localhost/api/parcels?hasCoords=true");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.source).toBe("org-fallback");
    expect(body.degraded).toBe(true);
    expect(body.parcels.length).toBeGreaterThan(0);
    expect(requestPropertyDbGatewayMock).not.toHaveBeenCalled();
  });

  // Dev fallback tests removed — isDevParcelFallbackEnabled() permanently returns false.
  // Parcels always use real DB / Property DB / local API.
});
