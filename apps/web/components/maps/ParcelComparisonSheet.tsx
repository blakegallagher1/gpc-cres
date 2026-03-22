"use client";

import type { MapParcel } from "./types";

interface ParcelComparisonSheetProps {
  open: boolean;
  parcels: MapParcel[];
  onClose: () => void;
}

export function ParcelComparisonSheet({ open, parcels, onClose }: ParcelComparisonSheetProps) {
  if (!open) return null;

  return (
    <div className="absolute bottom-0 left-0 right-0 z-30 border-t bg-white/95 shadow-2xl">
      <div className="mx-auto max-w-7xl p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-semibold">Parcel Compare ({parcels.length})</div>
          <button type="button" onClick={onClose} className="rounded border px-2 py-1 text-xs">
            Close
          </button>
        </div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3 xl:grid-cols-4">
          {parcels.map((parcel) => (
            <div key={parcel.id} className="rounded border bg-white p-2 text-xs">
              <div className="font-semibold text-gray-900">{parcel.address}</div>
              <div className="mt-1 text-gray-600">ID: {parcel.id}</div>
              <div className="text-gray-600">
                Acres: {parcel.acreage != null ? Number(parcel.acreage).toFixed(2) : "-"}
              </div>
              <div className="text-gray-600">Zoning: {parcel.currentZoning ?? "-"}</div>
              <div className="text-gray-600">Flood: {parcel.floodZone ?? "-"}</div>
              <div className="text-gray-600">Deal: {parcel.dealName ?? "-"}</div>
              <div className="text-gray-600">Status: {parcel.dealStatus ?? "-"}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
