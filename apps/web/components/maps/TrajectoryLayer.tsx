"use client";

import React, { useEffect, useRef, useMemo } from "react";
import { GeoJSON, useMap } from "react-leaflet";
import type { Layer, PathOptions } from "leaflet";
import type { Feature, FeatureCollection } from "geojson";
import L from "leaflet";
import "leaflet.vectorgrid";

/** leaflet.vectorgrid extends L at runtime; @types/leaflet has no declaration */
const vectorGrid = (L as unknown as { vectorGrid: { protobuf: (url: string, opts?: object) => L.Layer } })
  .vectorGrid;

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

export interface VelocityParcel {
  parcel_id: string;
  velocity_of_change: number;
}

interface TrajectoryLayerProps {
  /** Legacy: GeoJSON FeatureCollection from Market Trajectory agent */
  data?: FeatureCollection | null;
  /** New: lightweight parcel_id + velocity; base shapes from vector tiles */
  velocityData?: VelocityParcel[] | null;
  /** Tile URL template for parcel vector tiles. Default: /api/map/tiles/{z}/{x}/{y} */
  vectorTileUrl?: string;
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
// Vector tile layer (uses L.vectorGrid.protobuf)
// ---------------------------------------------------------------------------

const DEFAULT_TILE_URL = "/api/map/tiles/{z}/{x}/{y}";

function VectorTileTrajectoryLayer({
  velocityData,
  vectorTileUrl,
}: {
  velocityData: VelocityParcel[];
  vectorTileUrl: string;
}) {
  const map = useMap();
  const layerRef = useRef<L.Layer | null>(null);

  const velocityMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of velocityData) {
      m.set(String(v.parcel_id), v.velocity_of_change);
    }
    return m;
  }, [velocityData]);

  useEffect(() => {
    const baseUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}${vectorTileUrl}`
        : vectorTileUrl;

    const layer = vectorGrid.protobuf(baseUrl, {
      vectorTileLayerStyles: {
        parcels: (properties: Record<string, unknown>) => {
          const pid = properties?.parcel_id != null ? String(properties.parcel_id) : null;
          const vel = pid != null ? velocityMap.get(pid) : undefined;
          return {
            fillColor: vel != null ? getVelocityColor(vel) : "#e5e7eb",
            fillOpacity: 0.65,
            weight: 1,
            opacity: 1,
            color: "#ffffff",
          } as PathOptions;
        },
      },
      interactive: true,
    });

    layer.addTo(map);
    layerRef.current = layer;
    return () => {
      map.removeLayer(layer);
      layerRef.current = null;
    };
  }, [map, vectorTileUrl, velocityMap]);

  return null;
}

// ---------------------------------------------------------------------------
// Legacy GeoJSON component
// ---------------------------------------------------------------------------

function GeoJSONTrajectoryLayer({ data }: { data: FeatureCollection }) {
  const style = (feature?: Feature): PathOptions => {
    const geomType = feature?.geometry?.type;
    if (geomType === "Polygon" || geomType === "MultiPolygon") {
      const score =
        (feature?.properties as TrajectoryPolygonProps)?.velocity_of_change ?? 0;
      return {
        fillColor: getVelocityColor(score),
        weight: 2,
        opacity: 1,
        color: "#ffffff",
        fillOpacity: 0.65,
      };
    }
    return {};
  };

  const onEachFeature = (feature: Feature, layer: Layer) => {
    const props = feature.properties;
    if (!props || !feature.geometry) return;
    const geomType = feature.geometry.type;

    if (geomType === "Point") {
      const p = props as unknown as TrajectoryPointProps;
      layer.bindPopup(
        `<div style="font-family:Inter,system-ui,sans-serif;max-width:240px">
          <strong style="font-size:14px">${p.name ?? "Point of Interest"}</strong><br/>
          <span style="color:#6b7280;font-size:12px">${p.type ?? "indicator"}</span>
          ${p.details ? `<p style="margin:6px 0 0;font-size:12px">${p.details}</p>` : ""}
        </div>`
      );
    } else if (geomType === "Polygon" || geomType === "MultiPolygon") {
      const p = props as unknown as TrajectoryPolygonProps;
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
    <GeoJSON data={data} style={style} onEachFeature={onEachFeature} />
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const TrajectoryLayer: React.FC<TrajectoryLayerProps> = ({
  data,
  velocityData,
  vectorTileUrl = DEFAULT_TILE_URL,
}) => {
  const hasVelocityData =
    velocityData != null && Array.isArray(velocityData) && velocityData.length > 0;
  const hasLegacyData =
    data != null &&
    data.type === "FeatureCollection" &&
    Array.isArray(data.features) &&
    data.features.length > 0;

  if (hasVelocityData) {
    return (
      <VectorTileTrajectoryLayer
        velocityData={velocityData}
        vectorTileUrl={vectorTileUrl}
      />
    );
  }

  if (hasLegacyData) {
    return <GeoJSONTrajectoryLayer data={data} />;
  }

  return null;
};

export default TrajectoryLayer;
