"use client";

import { forwardRef, useMemo } from "react";
import {
  MapLibreParcelMap,
  type MapLibreParcelMapRef,
} from "./MapLibreParcelMap";
import { MapPageV2 } from "./MapPageV2";
import type {
  MapHudState,
  MapParcel,
  MapTrajectoryData,
  MapTrajectoryVelocityDatum,
} from "./types";
import type { ViewportBounds } from "./useParcelGeometry";

export type { MapParcel, MapTrajectoryData, MapTrajectoryVelocityDatum } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
  trajectoryData?: MapTrajectoryData | null;
  trajectoryVelocityData?: MapTrajectoryVelocityDatum[] | null;
  highlightParcelIds?: Set<string>;
  selectedParcelIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  onViewStateChange?: (center: [number, number], zoom: number, bounds?: ViewportBounds) => void;
  onMapReady?: () => void;
  onHudStateChange?: (state: MapHudState) => void;
  showChrome?: boolean;
  searchSlot?: React.ReactNode;
  dataFreshnessLabel?: string;
  latencyLabel?: string;
  overlayOverrides?: Record<string, boolean>;
}

export type ParcelMapRef = MapLibreParcelMapRef;

function isMapV2Enabled(): boolean {
  return process.env.NEXT_PUBLIC_MAP_V2_ENABLED === "true";
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const ParcelMap = forwardRef<MapLibreParcelMapRef, ParcelMapProps>(function ParcelMap({
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
  selectedParcelIds,
  onSelectionChange,
  onViewStateChange,
  onMapReady,
  onHudStateChange,
  showChrome = true,
  searchSlot,
  dataFreshnessLabel,
  latencyLabel,
  overlayOverrides,
}, ref) {
  const mlCenter: [number, number] = useMemo(() => [center[1], center[0]], [center]);

  if (isMapV2Enabled()) {
    return (
      <MapPageV2
        ref={ref}
        parcels={parcels}
        center={center}
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
        selectedParcelIds={selectedParcelIds}
        onSelectionChange={onSelectionChange}
        onViewStateChange={onViewStateChange}
        onMapReady={onMapReady}
        onHudStateChange={onHudStateChange}
        showChrome={showChrome}
        searchSlot={searchSlot}
        dataFreshnessLabel={dataFreshnessLabel}
        latencyLabel={latencyLabel}
        overlayOverrides={overlayOverrides}
      />
    );
  }

  return (
    <MapLibreParcelMap
      ref={ref}
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
      selectedParcelIds={selectedParcelIds}
      onSelectionChange={onSelectionChange}
      onViewStateChange={onViewStateChange}
      onMapReady={onMapReady}
      onHudStateChange={onHudStateChange}
      showChrome={showChrome}
      searchSlot={searchSlot}
      dataFreshnessLabel={dataFreshnessLabel}
      latencyLabel={latencyLabel}
      overlayOverrides={overlayOverrides}
    />
  );
});
