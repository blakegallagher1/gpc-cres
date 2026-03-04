import { describe, expect, it, vi } from "vitest";
import {
  computeNextSelection,
  getGeoJsonSourceSafe,
  parcelPopupHtml,
  setGeoJsonSourceDataSafe,
} from "./MapLibreParcelMap";
import type { MapParcel } from "./ParcelMap";

const baseParcel: MapParcel = {
  id: "p-1",
  address: "123 Main St",
  lat: 30.45,
  lng: -91.18,
};

describe("parcelPopupHtml sanitization", () => {
  it("renders expected popup content on happy path", () => {
    const html = parcelPopupHtml({
      ...baseParcel,
      dealName: "Deal One",
      dealStatus: "TRIAGE_DONE",
      acreage: 1.25,
      currentZoning: "C2",
      floodZone: "X",
    });

    expect(html).toContain("123 Main St");
    expect(html).toContain("Deal One");
    expect(html).toContain("Status: TRIAGE DONE");
    expect(html).toContain("1.25 acres");
    expect(html).toContain("Zoning: C2");
    expect(html).toContain("Flood: X");
  });

  it("escapes user-sourced HTML to block script injection", () => {
    const html = parcelPopupHtml({
      ...baseParcel,
      address: `<img src=x onerror="alert('xss')">`,
      dealName: `<script>alert("xss")</script>`,
      dealStatus: `HEARING"><script>alert(1)</script>`,
      currentZoning: `<b>C2</b>`,
      floodZone: `<svg onload=alert(1)>`,
    });

    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<svg");
    expect(html).toContain("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(&#39;xss&#39;)&quot;&gt;");
    expect(html).toContain("&lt;b&gt;C2&lt;/b&gt;");
  });

  it("handles optional/null parcel fields without throwing", () => {
    const html = parcelPopupHtml({
      ...baseParcel,
      acreage: null,
      dealName: undefined,
      dealStatus: undefined,
      currentZoning: null,
      floodZone: null,
    });

    expect(html).toContain("123 Main St");
    expect(html).not.toContain("Status:");
    expect(html).not.toContain("Zoning:");
    expect(html).not.toContain("Flood:");
    expect(html).not.toContain("acres");
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
