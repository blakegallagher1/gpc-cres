"use client";

import { useMemo } from "react";
import { ParcelMap, type MapParcel } from "@/components/maps/ParcelMap";
import type { ProspectParcel } from "./ProspectResults";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProspectMapProps {
  parcels: ProspectParcel[];
  polygon: number[][][] | null;
  onPolygonDrawn: (coordinates: number[][][]) => void;
  onClear: () => void;
  selectedIds: Set<string>;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ProspectMap({
  parcels,
  polygon,
  onPolygonDrawn,
  onClear,
  selectedIds,
}: ProspectMapProps) {
  const mappable: MapParcel[] = useMemo(
    () =>
      parcels.map((p) => ({
        id: p.id,
        address: p.address,
        lat: p.lat,
        lng: p.lng,
        floodZone: p.floodZone || null,
        currentZoning: p.zoning || null,
        propertyDbId: p.propertyDbId ?? p.parcelUid ?? null,
        geometryLookupKey: p.propertyDbId ?? p.parcelUid ?? p.id ?? null,
        acreage: p.acreage,
      })),
    [parcels]
  );

  return (
    <ParcelMap
      parcels={mappable}
      height="500px"
      polygon={polygon}
      onPolygonDrawn={onPolygonDrawn}
      onPolygonCleared={onClear}
      highlightParcelIds={selectedIds}
      showLayers
      showTools
    />
  );
}
