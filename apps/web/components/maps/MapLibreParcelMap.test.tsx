import { describe, expect, it, vi } from "vitest";
import {
  computeNextSelection,
  getDrawControlState,
  getGeometryStatusLabel,
  getGeoJsonSourceSafe,
  getReferenceOverlayStateForPreset,
  resolveReferenceOverlayPreset,
  setGeoJsonSourceDataSafe,
} from "./MapLibreParcelMap";
import {
  buildParcelPopupViewModel,
  buildTileParcelPopupViewModel,
} from "./MapPopupPresenter";
import type { MapParcel } from "./types";

const baseParcel: MapParcel = {
  id: "p-1",
  address: "123 Main St",
  lat: 30.45,
  lng: -91.18,
};

describe("map popup view models", () => {
  it("builds the parcel popup view model with typed actions", () => {
    const viewModel = buildParcelPopupViewModel({
      ...baseParcel,
      owner: "Owner LLC",
      dealName: "Deal One",
      dealStatus: "TRIAGE_DONE",
      acreage: 1.25,
      currentZoning: "C2",
      floodZone: "X",
    });

    expect(viewModel).toEqual({
      title: "123 Main St",
      subtitle: "Deal One",
      identityRows: [
        { label: "Parcel", value: "p-1" },
        { label: "Coords", value: "30.450000,-91.180000" },
      ],
      riskChips: ["C2", "X"],
      rows: [
        { label: "Owner", value: "Owner LLC" },
        { label: "Acreage", value: "1.25 acres" },
        { label: "Status", value: "TRIAGE DONE" },
        { label: "Zoning", value: "C2" },
        { label: "Flood", value: "X" },
      ],
      links: [
        {
          label: "Street View",
          href: "https://www.google.com/maps/@30.450000,-91.180000,3a,75y,0h,90t/data=!3m6!1e1",
        },
        {
          label: "Google Maps",
          href: "https://www.google.com/maps/search/?api=1&query=30.450000,-91.180000",
        },
      ],
      actions: [
        {
          label: "+ Deal",
          tone: "primary",
          action: { type: "create_deal", parcelId: "p-1" },
        },
        {
          label: "Screen",
          tone: "warning",
          action: { type: "screen_parcel", parcelId: "p-1" },
        },
        {
          label: "Comps",
          tone: "secondary",
          action: {
            type: "open_comps",
            parcelId: "p-1",
            lat: 30.45,
            lng: -91.18,
            address: "123 Main St",
          },
        },
      ],
    });
  });

  it("builds the tile popup view model without inline actions", () => {
    expect(
      buildTileParcelPopupViewModel({
        address: "456 River Rd",
        parcel_id: "tile-1",
        owner: "Owner LLC",
        area_sqft: 43560,
        assessed_value: 500000,
        lat: 30.44,
        lng: -91.19,
      }),
    ).toEqual({
      title: "456 River Rd",
      subtitle: "Parcel tile-1",
      identityRows: [{ label: "Parcel", value: "tile-1" }],
      riskChips: [],
      rows: [
        { label: "Owner", value: "Owner LLC" },
        { label: "Area", value: "1.00 acres (43,560 sqft)" },
        { label: "Assessed", value: "$500,000" },
      ],
      links: [
        {
          label: "Street View",
          href: "https://www.google.com/maps/@30.440000,-91.190000,3a,75y,0h,90t/data=!3m6!1e1",
        },
      ],
      actions: [],
    });
  });
});

describe("safe GeoJSON source helpers", () => {
  it("returns null when style is not loaded", () => {
    const getSource = vi.fn();
    const map = {
      isStyleLoaded: () => false,
      getSource,
    };

    expect(getGeoJsonSourceSafe(map, "draw-polygon-source")).toBeNull();
    expect(getSource).not.toHaveBeenCalled();
  });

  it("swallows map.getSource style-transition errors", () => {
    const map = {
      isStyleLoaded: () => true,
      getSource: vi.fn(() => {
        throw new TypeError("Cannot read properties of undefined (reading 'getSource')");
      }),
    };

    expect(getGeoJsonSourceSafe(map, "draw-polygon-source")).toBeNull();
  });

  it("sets source data when source exists", () => {
    const setData = vi.fn();
    const map = {
      isStyleLoaded: () => true,
      getSource: vi.fn(() => ({ setData })),
    };

    const ok = setGeoJsonSourceDataSafe(map, "draw-polygon-source", {
      type: "FeatureCollection",
      features: [],
    });

    expect(ok).toBe(true);
    expect(setData).toHaveBeenCalledWith({
      type: "FeatureCollection",
      features: [],
    });
  });

  it("returns false when source is unavailable", () => {
    const map = {
      isStyleLoaded: () => true,
      getSource: vi.fn(() => undefined),
    };

    const ok = setGeoJsonSourceDataSafe(map, "draw-polygon-source", {
      type: "FeatureCollection",
      features: [],
    });

    expect(ok).toBe(false);
  });
});

describe("computeNextSelection", () => {
  it("sets a single selection on plain click", () => {
    const next = computeNextSelection(new Set(["parcel-a"]), "parcel-b", false);
    expect(Array.from(next)).toEqual(["parcel-b"]);
  });

  it("adds a second parcel on multi-select click", () => {
    const next = computeNextSelection(new Set(["parcel-a"]), "parcel-b", true);
    expect(Array.from(next).sort()).toEqual(["parcel-a", "parcel-b"]);
  });

  it("toggles selected parcel off on multi-select click", () => {
    const next = computeNextSelection(new Set(["parcel-a", "parcel-b"]), "parcel-b", true);
    expect(Array.from(next)).toEqual(["parcel-a"]);
  });

  it("preserves insertion order for additive multi-select", () => {
    const next = computeNextSelection(new Set(["parcel-a", "parcel-c"]), "parcel-b", true);
    expect(Array.from(next)).toEqual(["parcel-a", "parcel-c", "parcel-b"]);
  });
});

describe("getGeometryStatusLabel", () => {
  it("prefers a dedicated geometry-unavailable label for missing parcel rows", () => {
    expect(
      getGeometryStatusLabel({
        status: "unavailable",
        requestedCount: 1,
        loadedCount: 0,
        unavailableCount: 1,
        pendingCount: 0,
      }, {
        failedCount: 1,
        geometryUnavailable: true,
        propertyDbUnconfigured: false,
      }),
    ).toBe("Geometry unavailable");
  });

  it("keeps provider-unconfigured messaging higher priority than missing geometry", () => {
    expect(
      getGeometryStatusLabel({
        status: "unavailable",
        requestedCount: 2,
        loadedCount: 0,
        unavailableCount: 2,
        pendingCount: 0,
      }, {
        failedCount: 2,
        geometryUnavailable: true,
        propertyDbUnconfigured: true,
      }),
    ).toBe("Shapes unavailable");
  });

  it("reports loaded and unavailable counts for partial parcel geometry coverage", () => {
    expect(
      getGeometryStatusLabel({
        status: "partial",
        requestedCount: 3,
        loadedCount: 2,
        unavailableCount: 1,
        pendingCount: 0,
      }, {
        failedCount: 1,
        geometryUnavailable: false,
        propertyDbUnconfigured: false,
      }),
    ).toBe("2 loaded · 1 unavailable");
  });

  it("shows a loaded-count badge once parcel shapes are ready", () => {
    expect(
      getGeometryStatusLabel({
        status: "ready",
        requestedCount: 2,
        loadedCount: 2,
        unavailableCount: 0,
        pendingCount: 0,
      }, {
        failedCount: 0,
        geometryUnavailable: false,
        propertyDbUnconfigured: false,
      }),
    ).toBe("2 shapes loaded");
  });
});

describe("reference layer presets", () => {
  it("builds the flood-risk preset with wetland context enabled", () => {
    expect(getReferenceOverlayStateForPreset("flood-risk")).toEqual({
      parcelBoundaries: true,
      zoning: false,
      flood: true,
      soils: false,
      wetlands: true,
      epa: false,
    });
  });

  it("resolves the active preset when the full stack is enabled", () => {
    expect(
      resolveReferenceOverlayPreset({
        parcelBoundaries: true,
        zoning: true,
        flood: true,
        soils: true,
        wetlands: true,
        epa: true,
      }),
    ).toBe("full-stack");
  });

  it("returns null for custom overlay mixes that do not match a preset", () => {
    expect(
      resolveReferenceOverlayPreset({
        parcelBoundaries: true,
        zoning: true,
        flood: true,
        soils: false,
        wetlands: false,
        epa: false,
      }),
    ).toBeNull();
  });
});

describe("getDrawControlState", () => {
  it("returns an idle prompt when drawing is off", () => {
    expect(getDrawControlState(false, false, 0)).toEqual({
      label: "Draw area",
      badge: "Off",
      hint: "Sketch a polygon to search inside a tighter geography without leaving the map.",
    });
  });

  it("returns point-aware copy while an area is being drawn", () => {
    expect(getDrawControlState(true, false, 3)).toEqual({
      label: "Drawing area",
      badge: "3 pts",
      hint: "Click to add points. Double-click or press Finish to close the area.",
    });
  });

  it("returns active-area copy when a polygon already exists", () => {
    expect(getDrawControlState(false, true, 0)).toEqual({
      label: "Active area",
      badge: "Live",
      hint: "Search, compare, or save the current polygon before clearing it.",
    });
  });
});
