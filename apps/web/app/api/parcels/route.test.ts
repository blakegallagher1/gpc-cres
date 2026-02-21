import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { resolveAuthMock, findManyMock, fetchMock } = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  findManyMock: vi.fn(),
  fetchMock: vi.fn(),
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

describe("GET /api/parcels", () => {
  let GET: typeof import("./route").GET;

  beforeEach(() => {
    vi.resetModules();
    resolveAuthMock.mockReset();
    findManyMock.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  });

  it("returns 401 when unauthenticated", async () => {
    ({ GET } = await import("./route"));
    resolveAuthMock.mockResolvedValue(null);
    const req = new NextRequest("http://localhost/api/parcels?hasCoords=true");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("returns org-scoped parcels when present", async () => {
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

    const req = new NextRequest("http://localhost/api/parcels?hasCoords=true");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.source).toBe("org");
    expect(body.parcels).toHaveLength(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to property-db results when org has no coordinate parcels", async () => {
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
    expect(body.source).toBe("property-db-fallback");
    expect(body.parcels.length).toBeGreaterThan(0);
    expect(body.parcels[0].propertyDbId).toBe("external-1");
  });

  it("maps fallback rows that only provide geom_simplified geometry", async () => {
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
    expect(body.source).toBe("property-db-fallback");
    expect(body.parcels.length).toBeGreaterThan(0);
    expect(body.parcels[0].lat).toBeTypeOf("number");
    expect(body.parcels[0].lng).toBeTypeOf("number");
  });

  it("maps fallback rows when geom_simplified is a JSON string", async () => {
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
    expect(body.source).toBe("property-db-fallback");
    expect(body.parcels.length).toBeGreaterThan(0);
    expect(body.parcels[0].lat).toBeTypeOf("number");
    expect(body.parcels[0].lng).toBeTypeOf("number");
  });

  it("uses SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for property-db fallback", async () => {
    ({ GET } = await import("./route"));
    process.env.SUPABASE_URL = "https://fallback.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
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
    expect(body.source).toBe("property-db-fallback");
    expect(body.parcels.length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalled();
  });

  it("uses NEXT_PUBLIC_SUPABASE_URL when SUPABASE_URL is unset", async () => {
    ({ GET } = await import("./route"));
    delete process.env.SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fallback.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
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
    expect(body.source).toBe("property-db-fallback");
    expect(body.parcels.length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalled();
  });

  it("still returns empty fallback when SUPABASE env are placeholders", async () => {
    ({ GET } = await import("./route"));
    process.env.SUPABASE_URL = "placeholder";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder";
    resolveAuthMock.mockResolvedValue({
      userId: "99999999-9999-4999-8999-999999999999",
      orgId: "11111111-1111-4111-8111-111111111111",
    });
    findManyMock.mockResolvedValue([]);

    const req = new NextRequest("http://localhost/api/parcels?hasCoords=true");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.source).toBe("property-db-fallback");
    expect(body.parcels).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // Dev fallback tests removed — isDevParcelFallbackEnabled() permanently returns false.
  // Parcels always use real DB / Property DB / local API.
});
