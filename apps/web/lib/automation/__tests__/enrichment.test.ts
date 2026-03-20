import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  propertyDbRpcMock,
  createAutomationTaskMock,
  prismaMock,
  captureAutomationTimeoutMock,
} = vi.hoisted(() => ({
  propertyDbRpcMock: vi.fn(),
  createAutomationTaskMock: vi.fn(),
  prismaMock: {
    parcel: { findFirst: vi.fn(), update: vi.fn() },
  },
  captureAutomationTimeoutMock: vi.fn(),
}));

vi.mock("@/lib/server/propertyDbRpc", () => ({
  propertyDbRpc: propertyDbRpcMock,
}));

vi.mock("../notifications", () => ({
  createAutomationTask: createAutomationTaskMock,
}));

vi.mock("../sentry", () => ({
  captureAutomationTimeout: captureAutomationTimeoutMock,
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: prismaMock,
}));

import {
  buildParcelEnrichmentUpdate,
  getParcelEnrichmentPayload,
  handleParcelCreated,
  normalizeAddress,
  scoreMatchConfidence,
  searchPropertyDbMatches,
} from "../enrichment";

describe("enrichment helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("normalizes punctuation and whitespace in addresses", () => {
    expect(normalizeAddress(" O'Neal,  #123. Main St ")).toBe("ONeal 123 Main St");
  });

  it("scores exact and partial matches predictably", () => {
    expect(scoreMatchConfidence("123 Main St", "123 Main St")).toBe(1);
    expect(scoreMatchConfidence("123 Main St", "123 Main St Baton Rouge LA")).toBe(0.85);
    expect(scoreMatchConfidence("123 Main Street", "123 Main Boulevard")).toBe(0.7);
    expect(scoreMatchConfidence("123 Main St", "456 Oak Ave")).toBe(0.2);
  });

  it("builds parcel update fields from gateway-normalized details and screening", () => {
    const update = buildParcelEnrichmentUpdate(
      "prop-1",
      {
        parcel_uid: "015-4249-4",
        lat: 30.44,
        lng: -91.12,
        acreage: 1.25,
      },
      {
        flood: {
          zones: [{ zone_code: "AE", overlap_pct: 60 }],
        },
        soils: {
          soil_types: [
            { soil_name: "Commerce", drainage_class: "Well drained", hydric_rating: "No" },
          ],
        },
        wetlands: {
          wetland_areas: [{ wetland_type: "Freshwater", overlap_pct: 20 }],
        },
        epa: {
          sites: [{ facility_name: "Plant A", distance_miles: 0.8 }],
        },
        ldeq: {
          permits: [{ facility_name: "Permit A", distance_miles: 1.2 }],
        },
        traffic: {
          roads: [{ road_name: "Airline Hwy", aadt: 42000, truck_pct: 12, distance_miles: 0.4 }],
        },
      },
    );

    expect(update).toMatchObject({
      propertyDbId: "prop-1",
      apn: "015-4249-4",
      lat: 30.44,
      lng: -91.12,
      acreage: 1.25,
      floodZone: "AE (60%)",
      soilsNotes: "Commerce: Well drained, hydric=No",
      wetlandsNotes: "Freshwater (20%)",
      trafficNotes: "Airline Hwy: 42,000 AADT, 12% trucks, 0.4mi",
    });
    expect(update.envNotes).toContain("EPA: 1 site(s) nearby");
    expect(update.envNotes).toContain("LDEQ: 1 permit(s) nearby");
  });

  it("loads parcel details and screening through the gateway helper", async () => {
    propertyDbRpcMock
      .mockResolvedValueOnce({ parcel_uid: "015-4249-4", acreage: 1.25 })
      .mockResolvedValueOnce({
        flood: { zones: [{ zone_code: "X", overlap_pct: 100 }] },
      });

    const payload = await getParcelEnrichmentPayload("prop-1");

    expect(propertyDbRpcMock).toHaveBeenNthCalledWith(1, "api_get_parcel", {
      parcel_id: "prop-1",
    });
    expect(propertyDbRpcMock).toHaveBeenNthCalledWith(2, "api_screen_full", {
      parcel_id: "prop-1",
    });
    expect(payload.details).toEqual({ parcel_uid: "015-4249-4", acreage: 1.25 });
    expect(payload.screening).toEqual({
      flood: { zones: [{ zone_code: "X", overlap_pct: 100 }] },
    });
    expect(payload.updateData).toMatchObject({
      propertyDbId: "prop-1",
      apn: "015-4249-4",
      acreage: 1.25,
      floodZone: "X (100%)",
    });
  });

  it("continues searching when api_search_parcels times out", async () => {
    vi.useFakeTimers();

    propertyDbRpcMock
      .mockReturnValueOnce(new Promise(() => {}))
      .mockResolvedValueOnce([{ id: "prop-1", site_address: "123 Main St" }]);

    const matchesPromise = searchPropertyDbMatches("123 Main St", "East Baton Rouge");

    await vi.advanceTimersByTimeAsync(8_000);

    await expect(matchesPromise).resolves.toEqual([
      { id: "prop-1", site_address: "123 Main St" },
    ]);
    expect(captureAutomationTimeoutMock).toHaveBeenCalledWith(
      expect.objectContaining({
        handler: "enrichment",
        label: "api_search_parcels timed out after 8000ms",
      }),
    );
  });

  it("returns partial enrichment data when parcel details time out", async () => {
    vi.useFakeTimers();

    propertyDbRpcMock
      .mockReturnValueOnce(new Promise(() => {}))
      .mockResolvedValueOnce({
        flood: { zones: [{ zone_code: "X", overlap_pct: 100 }] },
      });

    const payloadPromise = getParcelEnrichmentPayload("prop-1");

    await vi.advanceTimersByTimeAsync(5_000);

    const payload = await payloadPromise;

    expect(payload.details).toBeNull();
    expect(payload.screening).toEqual({
      flood: { zones: [{ zone_code: "X", overlap_pct: 100 }] },
    });
    expect(payload.updateData).toMatchObject({
      propertyDbId: "prop-1",
      floodZone: "X (100%)",
    });
    expect(captureAutomationTimeoutMock).toHaveBeenCalledWith(
      expect.objectContaining({
        handler: "enrichment",
        label: "api_get_parcel timed out after 5000ms",
      }),
    );
  });

  it("returns parcel details when screening times out", async () => {
    vi.useFakeTimers();

    propertyDbRpcMock
      .mockResolvedValueOnce({ parcel_uid: "015-4249-4", acreage: 1.25 })
      .mockReturnValueOnce(new Promise(() => {}));

    const payloadPromise = getParcelEnrichmentPayload("prop-1");

    await vi.advanceTimersByTimeAsync(12_000);

    const payload = await payloadPromise;

    expect(payload.details).toEqual({ parcel_uid: "015-4249-4", acreage: 1.25 });
    expect(payload.screening).toBeNull();
    expect(payload.updateData).toMatchObject({
      propertyDbId: "prop-1",
      apn: "015-4249-4",
      acreage: 1.25,
    });
    expect(captureAutomationTimeoutMock).toHaveBeenCalledWith(
      expect.objectContaining({
        handler: "enrichment",
        label: "api_screen_full timed out after 12000ms",
      }),
    );
  });
});

describe("handleParcelCreated", () => {
  const baseEvent = {
    type: "parcel.created" as const,
    parcelId: "parcel-1",
    dealId: "deal-1",
    orgId: "org-1",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes the jurisdiction parish into property DB search", async () => {
    prismaMock.parcel.findFirst.mockResolvedValue({
      id: "parcel-1",
      address: "123 Main St",
      dealId: "deal-1",
      propertyDbId: null,
      deal: { jurisdiction: { name: "East Baton Rouge" } },
    });
    propertyDbRpcMock.mockResolvedValueOnce([{ id: "prop-1", site_address: "123 Main St" }]);
    propertyDbRpcMock.mockResolvedValueOnce({ parcel_uid: "015-4249-4" });
    propertyDbRpcMock.mockResolvedValueOnce({ flood: { zones: [] } });
    prismaMock.parcel.update.mockResolvedValue({});

    await handleParcelCreated(baseEvent);

    expect(propertyDbRpcMock).toHaveBeenNthCalledWith(1, "api_search_parcels", {
      search_text: "123 Main St",
      parish: "East Baton Rouge",
      limit_rows: 10,
    });
  });

  it("skips parcels that are missing an address or already enriched", async () => {
    prismaMock.parcel.findFirst.mockResolvedValueOnce({
      id: "parcel-1",
      address: null,
      dealId: "deal-1",
      propertyDbId: null,
      deal: { jurisdiction: { name: "East Baton Rouge" } },
    });

    await handleParcelCreated(baseEvent);

    prismaMock.parcel.findFirst.mockResolvedValueOnce({
      id: "parcel-1",
      address: "123 Main St",
      dealId: "deal-1",
      propertyDbId: "existing",
      deal: { jurisdiction: { name: "East Baton Rouge" } },
    });

    await handleParcelCreated(baseEvent);

    expect(propertyDbRpcMock).not.toHaveBeenCalled();
    expect(prismaMock.parcel.update).not.toHaveBeenCalled();
  });

  it("auto-applies a single high-confidence match", async () => {
    prismaMock.parcel.findFirst.mockResolvedValue({
      id: "parcel-1",
      address: "123 Main St",
      dealId: "deal-1",
      propertyDbId: null,
      deal: { jurisdiction: { name: "East Baton Rouge" } },
    });
    propertyDbRpcMock.mockResolvedValueOnce([{ id: "prop-1", site_address: "123 Main St" }]);
    propertyDbRpcMock.mockResolvedValueOnce({ parcel_uid: "015-4249-4", acreage: 1.1 });
    propertyDbRpcMock.mockResolvedValueOnce({ flood: { zones: [{ zone_code: "X", overlap_pct: 100 }] } });
    prismaMock.parcel.update.mockResolvedValue({});

    await handleParcelCreated(baseEvent);

    expect(prismaMock.parcel.update).toHaveBeenCalledWith({
      where: { id: "parcel-1" },
      data: expect.objectContaining({
        propertyDbId: "prop-1",
        apn: "015-4249-4",
        acreage: 1.1,
        floodZone: "X (100%)",
      }),
    });
    expect(createAutomationTaskMock).not.toHaveBeenCalled();
  });

  it("creates a manual review task when no matches are found", async () => {
    prismaMock.parcel.findFirst.mockResolvedValue({
      id: "parcel-1",
      address: "999 Nowhere Rd",
      dealId: "deal-1",
      propertyDbId: null,
      deal: { jurisdiction: { name: "East Baton Rouge" } },
    });
    propertyDbRpcMock.mockResolvedValue([]);

    await handleParcelCreated(baseEvent);

    expect(createAutomationTaskMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org-1",
        dealId: "deal-1",
        type: "enrichment_review",
        title: "Manual geocoding needed",
      }),
    );
  });
});
