import { describe, expect, it, vi } from "vitest";
import { searchGeocodedPlaces, searchLocalGeocodedPlaces } from "./geocoder";
import type { MapParcel } from "@/components/maps/types";

const parcels: MapParcel[] = [
  {
    id: "p-1",
    address: "123 Main St",
    lat: 30.1,
    lng: -91.1,
    owner: "Alpha LLC",
  },
  {
    id: "p-2",
    address: "456 River Rd",
    lat: 30.2,
    lng: -91.2,
  },
];

describe("geocoder", () => {
  it("returns ranked local parcel matches first", () => {
    const places = searchLocalGeocodedPlaces(parcels, "123 Main", 4);
    expect(places).toHaveLength(1);
    expect(places[0]).toMatchObject({
      id: "parcel:p-1",
      label: "123 Main St",
      parcelId: "p-1",
      owner: "Alpha LLC",
      source: "parcel",
    });
  });

  it("falls back to nominatim when local parcels do not match", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ([
          {
            display_name: "789 Commerce Blvd, Baton Rouge, LA",
            lat: "30.4",
            lon: "-91.3",
          },
        ]),
      })) as unknown as typeof fetch,
    );

    const places = await searchGeocodedPlaces("789 Commerce", parcels, { limit: 4 });

    expect(places).toHaveLength(1);
    expect(places[0]).toMatchObject({
      label: "789 Commerce Blvd, Baton Rouge, LA",
      source: "nominatim",
    });
  });
});
