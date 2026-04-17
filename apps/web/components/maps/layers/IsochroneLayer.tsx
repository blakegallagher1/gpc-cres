"use client";

import { useMemo } from "react";
import { Source, Layer } from "@vis.gl/react-maplibre";

type IsochroneFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  { contour?: number; minutes?: number; [k: string]: unknown }
>;

interface IsochroneLayerProps {
  visible: boolean;
  /** GeoJSON FeatureCollection returned by Mapbox Isochrone API (3 contours). */
  data?: IsochroneFeatureCollection | null;
}

/**
 * Renders a Mapbox-style drive-time isochrone FeatureCollection as three
 * concentric 15 / 30 / 45-minute bands. The parent component is responsible
 * for computing the FeatureCollection (via `POST /api/map/isochrone` with a
 * `minutes: number[]` body) and passing it in as `data`.
 *
 * Each feature's `contour` (or `minutes`) property controls which band it
 * maps into — 15-min bands render innermost and opaque, 45-min bands
 * outermost and translucent.
 */
export function IsochroneLayer({ visible, data }: IsochroneLayerProps) {
  // Normalize null/undefined to an empty FeatureCollection so the maplibre
  // Source always has a valid shape.
  const safeData: IsochroneFeatureCollection = useMemo(
    () =>
      data ?? {
        type: "FeatureCollection" as const,
        features: [],
      },
    [data],
  );

  return (
    <Source id="isochrone" type="geojson" data={safeData}>
      {/* 45-minute band (outermost, most translucent) */}
      <Layer
        id="isochrone-fill-45"
        type="fill"
        filter={["any", ["==", ["get", "contour"], 45], ["==", ["get", "minutes"], 45]]}
        layout={{ visibility: visible ? "visible" : "none" }}
        paint={{
          "fill-color": "#3b82f6",
          "fill-opacity": 0.15,
        }}
      />
      <Layer
        id="isochrone-line-45"
        type="line"
        filter={["any", ["==", ["get", "contour"], 45], ["==", ["get", "minutes"], 45]]}
        layout={{
          visibility: visible ? "visible" : "none",
          "line-join": "round",
          "line-cap": "round",
        }}
        paint={{
          "line-color": "#2563eb",
          "line-width": 1.2,
          "line-opacity": 0.55,
        }}
      />

      {/* 30-minute band */}
      <Layer
        id="isochrone-fill-30"
        type="fill"
        filter={["any", ["==", ["get", "contour"], 30], ["==", ["get", "minutes"], 30]]}
        layout={{ visibility: visible ? "visible" : "none" }}
        paint={{
          "fill-color": "#2563eb",
          "fill-opacity": 0.22,
        }}
      />
      <Layer
        id="isochrone-line-30"
        type="line"
        filter={["any", ["==", ["get", "contour"], 30], ["==", ["get", "minutes"], 30]]}
        layout={{
          visibility: visible ? "visible" : "none",
          "line-join": "round",
          "line-cap": "round",
        }}
        paint={{
          "line-color": "#1d4ed8",
          "line-width": 1.4,
          "line-opacity": 0.7,
        }}
      />

      {/* 15-minute band (innermost, most opaque) */}
      <Layer
        id="isochrone-fill-15"
        type="fill"
        filter={["any", ["==", ["get", "contour"], 15], ["==", ["get", "minutes"], 15]]}
        layout={{ visibility: visible ? "visible" : "none" }}
        paint={{
          "fill-color": "#1d4ed8",
          "fill-opacity": 0.32,
        }}
      />
      <Layer
        id="isochrone-line-15"
        type="line"
        filter={["any", ["==", ["get", "contour"], 15], ["==", ["get", "minutes"], 15]]}
        layout={{
          visibility: visible ? "visible" : "none",
          "line-join": "round",
          "line-cap": "round",
        }}
        paint={{
          "line-color": "#1e3a8a",
          "line-width": 1.6,
          "line-opacity": 0.85,
        }}
      />
    </Source>
  );
}
