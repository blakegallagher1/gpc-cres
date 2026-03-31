import { describe, expect, it } from "vitest";
import { buildParcelHoverTarget } from "./mapLibreAdapter";
import type { MapParcel } from "./types";

describe("buildParcelHoverTarget", () => {
  it("prefers the resolved parcel record when available", () => {
    const parcel: MapParcel = {
      id: "p-1",
      address: "123 Main St",
      lat: 30.45,
      lng: -91.18,
      owner: "Owner LLC",
      acreage: 1.2,
      currentZoning: "C2",
      floodZone: "X",
      dealName: "Deal One",
      dealStatus: "TRIAGE_DONE",
      propertyDbId: "uid-1",
    };

    expect(buildParcelHoverTarget({ parcel })).toEqual({
      id: "p-1",
      address: "123 Main St",
      propertyDbId: "uid-1",
      owner: "Owner LLC",
      acreage: 1.2,
      currentZoning: "C2",
      floodZone: "X",
      dealName: "Deal One",
      dealStatus: "TRIAGE_DONE",
    });
  });

  it("extracts a hover target from MapLibre feature properties", () => {
    expect(
      buildParcelHoverTarget({
        parcelId: "p-2",
        properties: {
          id: "p-2",
          address: "456 River Rd",
          owner_name: "River Holdings",
          acreage: "3.4",
          zoning: "I1",
          flood_zone: "AE",
        },
      }),
    ).toEqual({
      id: "p-2",
      address: "456 River Rd",
      propertyDbId: "p-2",
      owner: "River Holdings",
      acreage: 3.4,
      currentZoning: "I1",
      floodZone: "AE",
      dealName: null,
      dealStatus: null,
    });
  });
});
