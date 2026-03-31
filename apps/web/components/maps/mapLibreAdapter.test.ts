import { describe, expect, it, vi } from "vitest";
import { bindMapInteractionHandlers, buildParcelHoverTarget } from "./mapLibreAdapter";
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

describe("bindMapInteractionHandlers", () => {
  it("zooms in when a parcel cluster is clicked", () => {
    const handlers = new Map<string, (event: unknown) => void>();
    const flyTo = vi.fn();
    const map = {
      getZoom: () => 11,
      flyTo,
      getCanvas: () => ({ style: { cursor: "" } }),
      on: (eventName: string, layerOrHandler: string | ((event: unknown) => void), handler?: (event: unknown) => void) => {
        if (eventName === "click" && typeof layerOrHandler === "string" && handler) {
          handlers.set(layerOrHandler, handler);
        }
      },
      off: vi.fn(),
    } as unknown as Parameters<typeof bindMapInteractionHandlers>[0]["map"];

    const cleanup = bindMapInteractionHandlers({
      map,
      fitBounds: vi.fn(),
      updateSelection: vi.fn(),
      getParcelById: vi.fn(),
      openParcelPopup: vi.fn(),
      openTilePopup: vi.fn(),
      setCursor: vi.fn(),
      setZoom: vi.fn(),
      setViewportBounds: vi.fn(),
      boundsTimerRef: { current: null },
    });

    handlers.get("parcel-clusters")?.({
      features: [
        {
          properties: { point_count: 12 },
          geometry: { type: "Point", coordinates: [-91.18, 30.45] },
        },
      ],
      lngLat: { lng: -91.18, lat: 30.45 },
    });

    expect(flyTo).toHaveBeenCalledWith({
      center: [-91.18, 30.45],
      zoom: 13,
    });

    cleanup();
  });
});
