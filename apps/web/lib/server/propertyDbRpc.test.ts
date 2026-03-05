import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireGatewayConfigMock,
  getCloudflareAccessHeadersFromEnvMock,
  fetchMock,
} = vi.hoisted(() => ({
  requireGatewayConfigMock: vi.fn(),
  getCloudflareAccessHeadersFromEnvMock: vi.fn(),
  fetchMock: vi.fn(),
}));

vi.mock("@/lib/server/propertyDbEnv", () => ({
  requireGatewayConfig: requireGatewayConfigMock,
  getCloudflareAccessHeadersFromEnv: getCloudflareAccessHeadersFromEnvMock,
}));

function makeJsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("propertyDbRpc", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.resetModules();
    requireGatewayConfigMock.mockReset();
    getCloudflareAccessHeadersFromEnvMock.mockReset();
    fetchMock.mockReset();

    requireGatewayConfigMock.mockReturnValue({
      url: "https://api.example.com/",
      key: "gateway-key",
    });
    getCloudflareAccessHeadersFromEnvMock.mockReturnValue({
      "CF-Access-Client-Id": "cf-id",
      "CF-Access-Client-Secret": "cf-secret",
    });

    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    global.fetch = originalFetch;
  });

  it("queries parcel search through the gateway", async () => {
    const { propertyDbRpc } = await import("./propertyDbRpc");
    fetchMock.mockResolvedValue(makeJsonResponse({ ok: true, data: [{ id: "prop-1" }] }));

    const result = await propertyDbRpc("api_search_parcels", {
      search_text: "123 Main St",
      parish: "East Baton Rouge",
      limit_rows: 10,
    });

    expect(result).toEqual([{ id: "prop-1" }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/api/parcels/search");
    expect(parsed.searchParams.get("q")).toBe("123 Main St");
    expect(parsed.searchParams.get("parish")).toBe("East Baton Rouge");
    expect(parsed.searchParams.get("limit")).toBe("10");
    expect(options).toMatchObject({
      method: "GET",
      cache: "no-store",
      headers: {
        Authorization: "Bearer gateway-key",
        "CF-Access-Client-Id": "cf-id",
        "CF-Access-Client-Secret": "cf-secret",
      },
    });
  });

  it("loads a parcel by id through the gateway", async () => {
    const { propertyDbRpc } = await import("./propertyDbRpc");
    fetchMock.mockResolvedValue(makeJsonResponse({ ok: true, data: { id: "prop-1", parcel_uid: "015-4249-4" } }));

    const result = await propertyDbRpc("api_get_parcel", { parcel_id: "prop-1" });

    expect(result).toEqual({ id: "prop-1", parcel_uid: "015-4249-4" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/api/parcels/prop-1",
      expect.objectContaining({
        method: "GET",
      }),
    );
  });

  it("normalizes screening responses into the legacy enrichment shape", async () => {
    const { propertyDbRpc } = await import("./propertyDbRpc");
    fetchMock.mockResolvedValue(
      makeJsonResponse({
        ok: true,
        data: {
          parcelId: "015-4249-4",
          flood: {
            inSfha: true,
            zoneCount: 1,
            zones: [{ floodZone: "AE", overlapPct: 60, panelId: "panel-1" }],
          },
          soils: {
            hasHydric: true,
            unitCount: 1,
            soilUnits: [{ mapunitKey: "Commerce", drainageClass: "Well drained", hydricRating: "Yes", overlapPct: 40 }],
          },
          wetlands: {
            hasWetlands: true,
            wetlandAreas: [{ wetlandType: "Freshwater", overlapPct: 20 }],
          },
          epa: {
            facilityCount: 1,
            facilities: [{ name: "Plant A", distanceMiles: 0.8 }],
          },
          traffic: {
            available: true,
            trafficCounts: [{ route: "Airline Hwy", aadt: 42000, truckPct: 12, distanceMiles: 0.4 }],
          },
          ldeq: {
            available: true,
            permits: [{ facilityName: "Permit A", distanceMiles: 1.2 }],
          },
        },
      }),
    );

    const result = await propertyDbRpc("api_screen_full", { parcel_id: "prop-1" });

    expect(result).toEqual({
      parcel_id: "015-4249-4",
      zoning: null,
      flood: {
        in_sfha: true,
        zone_count: 1,
        zones: [{ zone_code: "AE", overlap_pct: 60, bfe: null, panel_id: "panel-1", in_sfha: null }],
      },
      soils: {
        has_hydric: true,
        unit_count: 1,
        soil_types: [
          {
            soil_name: "Commerce",
            mapunit_key: "Commerce",
            drainage_class: "Well drained",
            hydric_rating: "Yes",
            shrink_swell: null,
            overlap_pct: 40,
          },
        ],
      },
      wetlands: {
        has_wetlands: true,
        area_count: 1,
        wetland_areas: [{ wetland_type: "Freshwater", overlap_pct: 20 }],
      },
      epa: {
        site_count: 1,
        sites: [
          {
            registry_id: null,
            facility_name: "Plant A",
            city: null,
            status: null,
            violations: null,
            penalties: null,
            distance_miles: 0.8,
          },
        ],
      },
      traffic: {
        available: true,
        count_stations: 1,
        message: null,
        roads: [
          {
            road_name: "Airline Hwy",
            aadt: 42000,
            year: null,
            truck_pct: 12,
            distance_miles: 0.4,
          },
        ],
      },
      ldeq: {
        available: true,
        permit_count: 1,
        message: null,
        permits: [
          {
            ai_number: null,
            facility_name: "Permit A",
            permit_type: null,
            status: null,
            distance_miles: 1.2,
          },
        ],
      },
    });
  });

  it("throws a helpful error when the gateway returns a non-OK response", async () => {
    const { propertyDbRpc } = await import("./propertyDbRpc");
    fetchMock.mockResolvedValue(new Response("backend down", { status: 502 }));

    await expect(propertyDbRpc("api_get_parcel", { parcel_id: "prop-1" })).rejects.toThrow(
      "[property-db-rpc] api_get_parcel failed (502): backend down",
    );
  });
});
