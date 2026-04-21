"use client";

import { useMemo, useState } from "react";
import type { MapParcel } from "./types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export interface MapParcelDataGridProps {
  parcels: MapParcel[];
  selectedIds: Set<string>;
  onFocusParcel: (parcel: MapParcel) => void;
  onToggleParcel: (parcelId: string) => void;
  embedded?: boolean;
}

type SortKey = "address" | "acreage" | "zoning" | "flood";

function sortValue(parcel: MapParcel, sortKey: SortKey): string | number {
  if (sortKey === "address") return parcel.address.toLowerCase();
  if (sortKey === "acreage") return parcel.acreage ?? -1;
  if (sortKey === "zoning") return (parcel.currentZoning ?? "").toLowerCase();
  return (parcel.floodZone ?? "").toLowerCase();
}

export function MapParcelDataGrid({
  parcels,
  selectedIds,
  onFocusParcel,
  onToggleParcel,
  embedded = false,
}: MapParcelDataGridProps) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("address");
  const [desc, setDesc] = useState(false);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const narrowed = normalized.length === 0
      ? parcels
      : parcels.filter((parcel) =>
          [parcel.address, parcel.id, parcel.currentZoning ?? "", parcel.floodZone ?? ""]
            .join(" ")
            .toLowerCase()
            .includes(normalized)
        );

    return [...narrowed].sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      if (av === bv) return 0;
      if (av > bv) return desc ? -1 : 1;
      return desc ? 1 : -1;
    });
  }, [desc, parcels, query, sortKey]);

  return (
    <aside
      className={
        embedded
          ? "flex h-full min-h-0 flex-col bg-transparent"
          : "flex h-full w-[26rem] flex-col border-l border-map-border bg-map-surface-overlay/98"
      }
    >
      <div className="border-b border-map-border px-3 py-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-map-text-muted">Parcel grid</p>
        <h3 className="mt-1 text-xs font-semibold text-map-text-primary">Live analyst table</h3>
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter parcels"
          className="mt-2 h-8 border-map-border bg-map-surface text-xs"
        />
        <div className="mt-2 flex flex-wrap gap-1">
          {(["address", "acreage", "zoning", "flood"] as const).map((key) => (
            <Button
              key={key}
              type="button"
              size="sm"
              variant={sortKey === key ? "default" : "outline"}
              className="h-6 px-2 text-[10px]"
              onClick={() => {
                if (sortKey === key) {
                  setDesc((value) => !value);
                } else {
                  setSortKey(key);
                  setDesc(false);
                }
              }}
            >
              {key}
              {sortKey === key ? (desc ? " ↓" : " ↑") : ""}
            </Button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full table-fixed border-collapse text-[11px]">
          <thead className="sticky top-0 bg-map-surface">
            <tr className="border-b border-map-border text-map-text-muted">
              <th className="w-8 px-2 py-1 text-left">Sel</th>
              <th className="px-2 py-1 text-left">Address</th>
              <th className="w-16 px-2 py-1 text-right">Acres</th>
              <th className="w-16 px-2 py-1 text-left">Flood</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((parcel) => {
              const selected = selectedIds.has(parcel.id);
              return (
                <tr
                  key={parcel.id}
                  className={`border-b border-map-border/60 ${selected ? "bg-map-accent/20" : "hover:bg-map-surface-elevated"}`}
                >
                  <td className="px-2 py-1 align-top">
                    <input
                      aria-label={`Select ${parcel.address}`}
                      type="checkbox"
                      checked={selected}
                      onChange={() => onToggleParcel(parcel.id)}
                    />
                  </td>
                  <td className="px-2 py-1 align-top">
                    <button
                      type="button"
                      onClick={() => onFocusParcel(parcel)}
                      className="block w-full truncate text-left text-map-text-primary hover:underline"
                      title={parcel.address}
                    >
                      {parcel.address}
                    </button>
                    <div className="truncate text-[10px] text-map-text-muted">{parcel.currentZoning ?? "No zoning"}</div>
                  </td>
                  <td className="px-2 py-1 text-right align-top text-map-text-secondary">
                    {parcel.acreage != null ? parcel.acreage.toFixed(2) : "—"}
                  </td>
                  <td className="px-2 py-1 align-top text-map-text-secondary">{parcel.floodZone ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </aside>
  );
}
