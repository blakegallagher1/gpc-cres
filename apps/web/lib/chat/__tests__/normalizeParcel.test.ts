import { describe, expect, it } from "vitest";

import { normalizeParcelToMapFeature } from "../normalizeParcel";

describe("normalizeParcelToMapFeature", () => {
  it("normalizes mixed parcel field names into a consistent map feature", () => {
    const feature = normalizeParcelToMapFeature({
      parcel_id: "p-123",
      site_addr: "123 Main St",
      zoning_type: "C2",
      owner_name: "Acme LLC",
      area_acres: "1.5",
      latitude: "30.451",
      longitude: "-91.187",
      geometry: {
        type: "Point",
        coordinates: [-91.187, 30.451],
      },
    });

    expect(feature).toEqual({
      parcelId: "p-123",
      address: "123 Main St",
      zoningType: "C2",
      owner: "Acme LLC",
      acres: 1.5,
      label: "123 Main St",
      center: { lat: 30.451, lng: -91.187 },
      geometry: {
        type: "Point",
        coordinates: [-91.187, 30.451],
      },
    });
  });

  it("falls back to centroid fields and secondary naming variants", () => {
    const feature = normalizeParcelToMapFeature({
      parcelId: "p-456",
      address: "456 Oak Ave",
      zoningType: "A2",
      owner: "Owner Name",
      areaAcres: 2.25,
      centroid_lat: 30.44,
      centroid_lng: -91.19,
      geojson: {
        type: "Polygon",
        coordinates: [
          [
            [-91.19, 30.44],
            [-91.18, 30.44],
            [-91.18, 30.45],
            [-91.19, 30.45],
            [-91.19, 30.44],
          ],
        ],
      },
    });

    expect(feature.parcelId).toBe("p-456");
    expect(feature.center).toEqual({ lat: 30.44, lng: -91.19 });
    expect(feature.acres).toBe(2.25);
    expect(feature.geometry).toMatchObject({ type: "Polygon" });
  });
});
