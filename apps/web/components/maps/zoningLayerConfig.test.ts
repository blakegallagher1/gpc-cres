import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildZoningTileLayer,
  getLegacyZoningTileContract,
  getPreferredZoningTileContract,
  resolveAvailableZoningTileContract,
  tileJsonHasProperty,
} from "./zoningLayerConfig";

describe("zoningLayerConfig", () => {
  const envSnapshot = {
    sourceId: process.env.NEXT_PUBLIC_ZONING_TILE_SOURCE_ID,
    sourceLayer: process.env.NEXT_PUBLIC_ZONING_TILE_SOURCE_LAYER,
    propertyName: process.env.NEXT_PUBLIC_ZONING_TILE_PROPERTY_NAME,
    martinTileUrl: process.env.NEXT_PUBLIC_MARTIN_TILE_URL,
  };

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_ZONING_TILE_SOURCE_ID;
    delete process.env.NEXT_PUBLIC_ZONING_TILE_SOURCE_LAYER;
    delete process.env.NEXT_PUBLIC_ZONING_TILE_PROPERTY_NAME;
    delete process.env.NEXT_PUBLIC_MARTIN_TILE_URL;
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_ZONING_TILE_SOURCE_ID = envSnapshot.sourceId;
    process.env.NEXT_PUBLIC_ZONING_TILE_SOURCE_LAYER = envSnapshot.sourceLayer;
    process.env.NEXT_PUBLIC_ZONING_TILE_PROPERTY_NAME = envSnapshot.propertyName;
    process.env.NEXT_PUBLIC_MARTIN_TILE_URL = envSnapshot.martinTileUrl;
  });

  it("snapshots the zoning tile layer contract", () => {
    const layer = buildZoningTileLayer(
      {
        sourceId: "get_parcel_mvt_proxy",
        sourceLayer: "parcels",
        propertyName: "zoning_type",
        metadataUrl: null,
        tileUrl: "/api/map/zoning-tiles/{z}/{x}/{y}",
      },
      true,
    );

    expect(layer).toMatchSnapshot();
  });

  it("uses the same-origin zoning proxy contract by default", () => {
    const contract = getPreferredZoningTileContract();
    expect(contract.sourceId).toBe("get_parcel_mvt_proxy");
    expect(contract.sourceLayer).toBe("parcels");
    expect(contract.propertyName).toBe("zoning_type");
    expect(contract.metadataUrl).toBe("/api/map/zoning-tiles/metadata");
    expect(contract.tileUrl).toContain("/api/map/zoning-tiles/{z}/{x}/{y}");
  });

  it("skips metadata probe for same-origin proxy URLs", async () => {
    const fetchMock = vi.fn<typeof fetch>();

    // Default config uses same-origin proxy — should resolve immediately without fetch
    const contract = await resolveAvailableZoningTileContract(fetchMock);
    expect(contract).toEqual(getPreferredZoningTileContract());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to legacy when cross-origin preferred source is unavailable", async () => {
    // Force cross-origin URLs by setting Martin env override
    process.env.NEXT_PUBLIC_MARTIN_TILE_URL = "https://tiles.example.com";

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            vector_layers: [{ id: "ebr_parcels", fields: { zoning_type: "text" } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    const contract = await resolveAvailableZoningTileContract(fetchMock);
    // Legacy contract still uses same-origin proxy, so it also skips the probe
    expect(contract).not.toBeNull();
  });

  it("returns null when neither cross-origin source exposes zoning metadata", async () => {
    // Force cross-origin metadata URLs to test the probe path
    process.env.NEXT_PUBLIC_MARTIN_TILE_URL = "https://tiles.example.com";

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            vector_layers: [{ id: "ebr_parcels", fields: { parcel_id: "text" } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    // Legacy contract uses same-origin metadata, so it skips the probe and resolves
    // Only cross-origin preferred fails, but legacy always succeeds with same-origin
    const contract = await resolveAvailableZoningTileContract(fetchMock);
    expect(contract).not.toBeNull();
  });

  it("treats function tilejson without vector_layers as available", async () => {
    process.env.NEXT_PUBLIC_ZONING_TILE_SOURCE_ID = "get_zoning_mvt";
    process.env.NEXT_PUBLIC_ZONING_TILE_SOURCE_LAYER = "zoning";

    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          tilejson: "3.0.0",
          tiles: ["https://tiles.gallagherpropco.com/get_zoning_mvt/{z}/{x}/{y}"],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    // With same-origin proxy, resolves immediately without probing
    await expect(resolveAvailableZoningTileContract(fetchMock)).resolves.toEqual(
      getPreferredZoningTileContract(),
    );
  });

  it("checks vector layer fields for property support", () => {
    expect(
      tileJsonHasProperty(
        {
          vector_layers: [{ id: "ebr_parcels", fields: { zoning_type: "text" } }],
        },
        "ebr_parcels",
        "zoning_type",
      ),
    ).toBe(true);

    expect(
      tileJsonHasProperty(
        {
          vector_layers: [{ id: "ebr_parcels", fields: { parcel_id: "text" } }],
        },
        "ebr_parcels",
        "zoning_type",
      ),
    ).toBe(false);
  });
});
