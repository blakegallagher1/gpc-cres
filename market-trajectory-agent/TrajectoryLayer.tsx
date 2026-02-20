"use client";

import React, { useMemo } from "react";
import { GeoJSON } from "react-leaflet";
import type { Feature, FeatureCollection, GeoJsonObject } from "geojson";
import type { Layer, PathOptions } from "leaflet";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TrajectoryPolygonProps {
  velocity_of_change: number;
  label?: string;
  permit_count?: number;
  indicator_count?: number;
  summary?: string;
}

interface TrajectoryPointProps {
  name: string;
  type: "permit" | "indicator" | string;
  details?: string;
}

interface TrajectoryLayerProps {
  /** GeoJSON FeatureCollection returned by the Market Trajectory agent */
  data: FeatureCollection | null;
}

// ---------------------------------------------------------------------------
// Choropleth color ramp
// ---------------------------------------------------------------------------

function getVelocityColor(score: number): string {
  if (score >= 90) return "#800026"; // dark red — hyper-growth
  if (score >= 70) return "#BD0026";
  if (score >= 50) return "#E31A1C";
  if (score >= 30) return "#FC4E2A";
  if (score >= 15) return "#FD8D3C";
  return "#FFEDA0"; // pale yellow — stagnant
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const TrajectoryLayer: React.FC<TrajectoryLayerProps> = ({ data }) => {
  // Stable key forces Leaflet to re-mount when data changes
  const dataKey = useMemo(
    () => (data ? JSON.stringify(data).slice(0, 64) + data.features.length : "empty"),
    [data]
  );

  if (!data || data.type !== "FeatureCollection" || data.features.length === 0) {
    return null;
  }

  // Polygon styling — filled choropleth based on velocity_of_change
  const style = (feature?: Feature): PathOptions => {
    const geomType = feature?.geometry?.type;
    if (geomType === "Polygon" || geomType === "MultiPolygon") {
      const score = (feature?.properties as TrajectoryPolygonProps)?.velocity_of_change ?? 0;
      return {
        fillColor: getVelocityColor(score),
        weight: 2,
        opacity: 1,
        color: "#ffffff",
        fillOpacity: 0.65,
      };
    }
    // Points rendered by onEachFeature popups; no fill styling needed
    return {};
  };

  // Popup content for both polygons and points
  const onEachFeature = (feature: Feature, layer: Layer) => {
    const props = feature.properties;
    if (!props) return;

    const geomType = feature.geometry.type;

    if (geomType === "Point") {
      const p = props as TrajectoryPointProps;
      layer.bindPopup(
        `<div style="font-family:Inter,system-ui,sans-serif;max-width:240px">
          <strong style="font-size:14px">${p.name ?? "Point of Interest"}</strong><br/>
          <span style="color:#6b7280;font-size:12px">${p.type ?? "indicator"}</span>
          ${p.details ? `<p style="margin:6px 0 0;font-size:12px">${p.details}</p>` : ""}
        </div>`
      );
    } else if (geomType === "Polygon" || geomType === "MultiPolygon") {
      const p = props as TrajectoryPolygonProps;
      layer.bindPopup(
        `<div style="font-family:Inter,system-ui,sans-serif;max-width:280px">
          <strong style="font-size:14px">${p.label ?? "Area"}</strong><br/>
          <span style="font-size:22px;font-weight:700;color:${getVelocityColor(p.velocity_of_change)}">${p.velocity_of_change}</span>
          <span style="font-size:12px;color:#6b7280"> / 100 velocity</span>
          <div style="margin-top:6px;font-size:12px;color:#374151">
            ${p.permit_count != null ? `Permits: ${p.permit_count}<br/>` : ""}
            ${p.indicator_count != null ? `Indicators: ${p.indicator_count}<br/>` : ""}
            ${p.summary ? `<p style="margin:4px 0 0">${p.summary}</p>` : ""}
          </div>
        </div>`
      );
    }
  };

  return (
    <GeoJSON
      key={dataKey}
      data={data as GeoJsonObject}
      style={style}
      onEachFeature={onEachFeature}
    />
  );
};

export default TrajectoryLayer;
