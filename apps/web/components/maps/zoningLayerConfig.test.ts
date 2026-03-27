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
  };

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_ZONING_TILE_SOURCE_ID;
    delete process.env.NEXT_PUBLIC_ZONING_TILE_SOURCE_LAYER;
    delete process.env.NEXT_PUBLIC_ZONING_TILE_PROPERTY_NAME;
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_ZONING_TILE_SOURCE_ID = envSnapshot.sourceId;
    process.env.NEXT_PUBLIC_ZONING_TILE_SOURCE_LAYER = envSnapshot.sourceLayer;
    process.env.NEXT_PUBLIC_ZONING_TILE_PROPERTY_NAME = envSnapshot.propertyName;
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

  it("uses the advanced zoning function contract by default", () => {
    const contract = getPreferredZoningTileContract();
    expect(contract.sourceId).toBe("get_zoning_mvt");
    expect(contract.sourceLayer).toBe("zoning");
    expect(contract.propertyName).toBe("zoning_type");
    expect(contract.metadataUrl).toBe("/api/map/zoning-tiles/metadata");
    expect(contract.tileUrl).toContain("/api/map/zoning-tiles/{z}/{x}/{y}");
  });

  it("resolves the default proxy contract without metadata fetches", async () => {
    const fetchMock = vi.fn<typeof fetch>();

    await expect(resolveAvailableZoningTileContract(fetchMock)).resolves.toEqual(
      getPreferredZoningTileContract(),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to the legacy parcel source when the direct Martin source is unavailable", async () => {
    process.env.NEXT_PUBLIC_ZONING_TILE_SOURCE_ID = "get_zoning_mvt";
    process.env.NEXT_PUBLIC_ZONING_TILE_SOURCE_LAYER = "zoning";

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

    await expect(resolveAvailableZoningTileContract(fetchMock)).resolves.toEqual(
      getLegacyZoningTileContract(),
    );
  });

  it("returns null when neither source exposes zoning metadata", async () => {
    process.env.NEXT_PUBLIC_ZONING_TILE_SOURCE_ID = "get_zoning_mvt";
    process.env.NEXT_PUBLIC_ZONING_TILE_SOURCE_LAYER = "zoning";

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

    await expect(resolveAvailableZoningTileContract(fetchMock)).resolves.toBeNull();
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
