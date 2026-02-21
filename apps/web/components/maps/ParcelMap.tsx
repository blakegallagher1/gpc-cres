"use client";

import { useMemo } from "react";
import { MapLibreParcelMap } from "./MapLibreParcelMap";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MapParcel {
  id: string;
  address: string;
  lat: number;
  lng: number;
  dealId?: string;
  dealName?: string;
  dealStatus?: string;
  floodZone?: string | null;
  currentZoning?: string | null;
  propertyDbId?: string | null;
  geometryLookupKey?: string | null;
  acreage?: number | null;
}

interface ParcelMapProps {
  parcels: MapParcel[];
  center?: [number, number];
  zoom?: number;
  height?: string;
  onParcelClick?: (id: string) => void;
  showLayers?: boolean;
  showTools?: boolean;
  polygon?: number[][][] | null;
  onPolygonDrawn?: (coordinates: number[][][]) => void;
  onPolygonCleared?: () => void;
  trajectoryData?: { type: "FeatureCollection"; features: unknown[] } | null;
  trajectoryVelocityData?: { parcel_id: string; velocity_of_change: number }[] | null;
  highlightParcelIds?: Set<string>;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ParcelMap({
  parcels,
  center = [30.4515, -91.1871],
  zoom = 11,
  height = "400px",
  onParcelClick,
  showLayers = true,
  showTools = false,
  polygon = null,
  onPolygonDrawn,
  onPolygonCleared,
  trajectoryData = null,
  trajectoryVelocityData = null,
  highlightParcelIds,
}: ParcelMapProps) {
  const mlCenter: [number, number] = useMemo(() => [center[1], center[0]], [center]);

  return (
    <MapLibreParcelMap
      parcels={parcels}
      center={mlCenter}
      zoom={zoom}
      height={height}
      onParcelClick={onParcelClick}
      showLayers={showLayers}
      showTools={showTools}
      polygon={polygon}
      onPolygonDrawn={onPolygonDrawn}
      onPolygonCleared={onPolygonCleared}
      trajectoryData={trajectoryData}
      trajectoryVelocityData={trajectoryVelocityData}
      highlightParcelIds={highlightParcelIds}
    />
  );
}
