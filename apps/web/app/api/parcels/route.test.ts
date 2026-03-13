import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  findManyMock,
  fetchMock,
  logPropertyDbRuntimeHealthMock,
  requireGatewayConfigMock,
  isPrismaConnectivityErrorMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  findManyMock: vi.fn(),
  fetchMock: vi.fn(),
  logPropertyDbRuntimeHealthMock: vi.fn(),
  requireGatewayConfigMock: vi.fn(),
  isPrismaConnectivityErrorMock: vi.fn().mockReturnValue(false),
}));

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

describe("GET /api/parcels", () => {
  let GET: typeof import("./route").GET;

  beforeEach(() => {
    vi.resetModules();
    resolveAuthMock.mockReset();
    findManyMock.mockReset();
    fetchMock.mockReset();
    logPropertyDbRuntimeHealthMock.mockReset();
    requireGatewayConfigMock.mockReset();
    isPrismaConnectivityErrorMock.mockReset();
    isPrismaConnectivityErrorMock.mockReturnValue(false);
    vi.stubGlobal("fetch", fetchMock);
    process.env.LOCAL_API_URL = "http://property-db.test";
    process.env.LOCAL_API_KEY = "test-key";
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
    expect(findManyMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
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
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns property-db results when gateway search returns parcels", async () => {
    ({ GET } = await import("./route"));
    resolveAuthMock.mockResolvedValue({
      userId: "99999999-9999-4999-8999-999999999999",
      orgId: "11111111-1111-4111-8111-111111111111",
    });
    findManyMock.mockResolvedValue([]);
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify([
          {
            id: "external-1",
            site_address: "456 River Rd",
            latitude: 30.41,
            longitude: -91.09,
            acreage: 3.4,
            flood_zone: "AE",
            zone_code: "I1",
            parcel_uid: "parcel-uid-1",
          },
        ]),
      json: async () => [
        {
          id: "external-1",
          site_address: "456 River Rd",
          latitude: 30.41,
          longitude: -91.09,
          acreage: 3.4,
          flood_zone: "AE",
          zone_code: "I1",
          parcel_uid: "parcel-uid-1",
        },
      ],
    } as Response);

    const req = new NextRequest("http://localhost/api/parcels?hasCoords=true");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.source).toBe("property-db");
    expect(body.parcels.length).toBeGreaterThan(0);
    expect(body.parcels[0].propertyDbId).toBe("external-1");
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
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps property-db rows that only provide geom_simplified geometry", async () => {
    ({ GET } = await import("./route"));
    resolveAuthMock.mockResolvedValue({
      userId: "99999999-9999-4999-8999-999999999999",
      orgId: "11111111-1111-4111-8111-111111111111",
    });
    findManyMock.mockResolvedValue([]);
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify([
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
        ]),
      json: async () => [
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
      ],
    } as Response);

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
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify([
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
        ]),
      json: async () => [
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
      ],
    } as Response);

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
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify([
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
        ]),
      json: async () => [
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
      ],
    } as Response);

    const req = new NextRequest("http://localhost/api/parcels?hasCoords=true");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.source).toBe("property-db");
    expect(body.parcels.length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalled();
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
    fetchMock.mockRejectedValue(new Error("network failure"));

    const req = new NextRequest("http://localhost/api/parcels?hasCoords=true&search=123");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.source).toBe("org-fallback");
    expect(body.degraded).toBe(true);
    expect(Array.isArray(body.parcels)).toBe(true);
    expect(body.parcels.length).toBeGreaterThan(0);
  });

  it("caps gateway fallback fanout for search requests", async () => {
    ({ GET } = await import("./route"));
    resolveAuthMock.mockResolvedValue({
      userId: "99999999-9999-4999-8999-999999999999",
      orgId: "11111111-1111-4111-8111-111111111111",
    });
    findManyMock.mockResolvedValue([]);
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => "[]",
      json: async () => [],
    } as Response);

    const req = new NextRequest(
      "http://localhost/api/parcels?hasCoords=true&search=1234+Long+Address+Name+Baton+Rouge+Louisiana",
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(8);
  });

  it("prioritizes exact suffix-preserving address variants ahead of canonicalized fallback queries", async () => {
    ({ GET } = await import("./route"));
    resolveAuthMock.mockResolvedValue({
      userId: "99999999-9999-4999-8999-999999999999",
      orgId: "11111111-1111-4111-8111-111111111111",
    });
    findManyMock.mockResolvedValue([]);
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => "[]",
      json: async () => [],
    } as Response);

    const req = new NextRequest("http://localhost/api/parcels?hasCoords=true&search=4416+HEATH+DR");
    const res = await GET(req);

    const attemptedQueries = fetchMock.mock.calls.map(([url]) =>
      new URL(String(url)).searchParams.get("q"),
    );

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
      fetchMock.mockImplementation((_url, init) =>
        new Promise((resolve, reject) => {
          const signal = init?.signal as AbortSignal | undefined;
          const timeout = setTimeout(() => {
            resolve({
              ok: true,
              text: async () =>
                JSON.stringify([
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
              json: async () => [
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
              ],
            } as Response);
          }, 7500);

          signal?.addEventListener(
            "abort",
            () => {
              clearTimeout(timeout);
              const abortError = new Error("This operation was aborted");
              abortError.name = "AbortError";
              reject(abortError);
            },
            { once: true },
          );
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
      fetchMock.mockImplementation((_url, init) =>
        new Promise((_, reject) => {
          const signal = init?.signal as AbortSignal | undefined;
          signal?.addEventListener(
            "abort",
            () => {
              const abortError = new Error("This operation was aborted");
              abortError.name = "AbortError";
              reject(abortError);
            },
            { once: true },
          );
        }),
      );

      const req = new NextRequest("http://localhost/api/parcels?hasCoords=true");
      const pending = GET(req);
      await vi.advanceTimersByTimeAsync(1600);
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
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => "[]",
      json: async () => [],
    } as Response);

    const req = new NextRequest("http://localhost/api/parcels?hasCoords=true");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(4);
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
        address: "7618 Copperfield Ct, Baton Rouge, LA",
        lat: 30.421,
        lng: -91.102,
        acreage: 0.4,
        floodZone: "X",
        currentZoning: "A1",
        propertyDbId: null,
        deal: null,
      },
    ]);
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => "[]",
      json: async () => [],
    } as Response);

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
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify([
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
        ]),
      json: async () => [
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
      ],
    } as Response);

    const req = new NextRequest("http://localhost/api/parcels?hasCoords=true");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.source).toBe("property-db");
    expect(body.parcels.length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalled();
  });

  it("uses org fallback when gateway config is missing", async () => {
    ({ GET } = await import("./route"));
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
  });

  // Dev fallback tests removed — isDevParcelFallbackEnabled() permanently returns false.
  // Parcels always use real DB / Property DB / local API.
});
