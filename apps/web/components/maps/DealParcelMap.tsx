"use client";

import dynamic from "next/dynamic";
import type { ParcelItem } from "@/components/deals/ParcelTable";
import { normalizeParcelId } from "@/lib/maps/parcelIdentity";
import type { MapParcel } from "./types";

const ParcelMap = dynamic(() => import("./ParcelMap").then((m) => m.ParcelMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-[300px] items-center justify-center rounded-lg border bg-muted">
      <p className="text-sm text-muted-foreground">Loading map...</p>
    </div>
  ),
});

interface DealParcelMapProps {
  parcels: ParcelItem[];
  dealName?: string;
  dealStatus?: string;
}

export function DealParcelMap({ parcels, dealName, dealStatus }: DealParcelMapProps) {
  const mappable: MapParcel[] = parcels
    .filter((p) => p.lat != null && p.lng != null)
    .flatMap((p) => {
      const parcelId = normalizeParcelId(p.propertyDbId ?? p.id);
      if (!parcelId) {
        return [];
      }

      return [{
        id: parcelId,
        parcelId,
        address: p.address,
        lat: Number(p.lat),
        lng: Number(p.lng),
        dealName,
        dealStatus,
        floodZone: p.floodZone ?? null,
        currentZoning: p.currentZoning ?? null,
        propertyDbId: parcelId,
        geometryLookupKey: parcelId,
        hasGeometry: true,
        acreage: p.acreage != null ? Number(p.acreage) : null,
      }];
    });

  if (mappable.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center rounded-lg border border-dashed bg-muted">
        <p className="text-sm text-muted-foreground">
          Enrich parcels to see them on the map.
        </p>
      </div>
    );
  }

  return <ParcelMap parcels={mappable} height="300px" showTools />;
}

export default DealParcelMap;
