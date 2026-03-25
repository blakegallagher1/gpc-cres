import { describe, expect, it, vi } from "vitest";
import {
  mapProspectParcels,
  requestViewportParcels,
  viewportBoundsToPolygon,
} from "./viewportParcelData";

describe("viewportParcelData", () => {
  it("converts viewport bounds into a closed rectangle polygon", () => {
    expect(
      viewportBoundsToPolygon({
        west: -91.2,
        south: 30.4,
        east: -91.1,
        north: 30.5,
      }),
    ).toEqual([[
      [-91.2, 30.4],
      [-91.1, 30.4],
      [-91.1, 30.5],
      [-91.2, 30.5],
      [-91.2, 30.4],
    ]]);
  });

  it("maps prospect route rows into normalized map parcels", () => {
    expect(
      mapProspectParcels({
        parcels: [
          {
            id: "parcel-1",
            address: "123 Main St",
            lat: 30.45,
            lng: -91.18,
            acreage: 1.5,
            floodZone: "X",
            zoning: "C2",
            propertyDbId: "property-1",
          },
        ],
        total: 1,
      }),
    ).toEqual([
      {
        id: "parcel-1",
        address: "123 Main St",
        lat: 30.45,
        lng: -91.18,
        acreage: 1.5,
        floodZone: "X",
        currentZoning: "C2",
        propertyDbId: "property-1",
        geometryLookupKey: "property-1",
      },
    ]);
  });

  it("posts viewport refresh requests through the existing prospect route", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        parcels: [
          {
            id: "parcel-1",
            address: "123 Main St",
            lat: 30.45,
            lng: -91.18,
            acreage: 1.5,
            floodZone: "X",
            zoning: "C2",
            propertyDbId: "property-1",
          },
        ],
        total: 1,
      }),
    }));

    const result = await requestViewportParcels({
      bounds: {
        west: -91.2,
        south: 30.4,
        east: -91.1,
        north: 30.5,
      },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/map/prospect",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          polygon: {
            type: "Polygon",
            coordinates: [[
              [-91.2, 30.4],
              [-91.1, 30.4],
              [-91.1, 30.5],
              [-91.2, 30.5],
              [-91.2, 30.4],
            ]],
          },
          filters: {
            searchText: "*",
          },
        }),
      }),
    );
    expect(result).toEqual({
      parcels: [
        expect.objectContaining({
          id: "parcel-1",
          address: "123 Main St",
        }),
      ],
      error: null,
      unauthorized: false,
    });
  });
});
