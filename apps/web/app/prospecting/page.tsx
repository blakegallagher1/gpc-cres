"use client";

import { useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { ProspectFilters, type ProspectFilterState } from "@/components/prospecting/ProspectFilters";
import { ProspectResults, type ProspectParcel } from "@/components/prospecting/ProspectResults";
import { Loader2, MapPin } from "lucide-react";

const ProspectMap = dynamic(
  () =>
    import("@/components/prospecting/ProspectMap").then((m) => m.ProspectMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[500px] items-center justify-center rounded-lg border bg-muted">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    ),
  }
);

export default function ProspectingPage() {
  const [polygon, setPolygon] = useState<number[][][] | null>(null);
  const [filters, setFilters] = useState<ProspectFilterState>({
    zoningCodes: [],
    minAcreage: undefined,
    maxAcreage: undefined,
    minAssessedValue: undefined,
    maxAssessedValue: undefined,
    excludeFloodZone: false,
  });
  const [parcels, setParcels] = useState<ProspectParcel[]>([]);
  const [allParcels, setAllParcels] = useState<ProspectParcel[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const searchParcels = useCallback(
    async (poly: number[][][], f: ProspectFilterState) => {
      setLoading(true);
      setSearched(true);
      try {
        const res = await fetch("/api/map/prospect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            polygon: { type: "Polygon", coordinates: poly },
            filters: {
              zoningCodes: f.zoningCodes.length > 0 ? f.zoningCodes : undefined,
              minAcreage: f.minAcreage,
              maxAcreage: f.maxAcreage,
              minAssessedValue: f.minAssessedValue,
              maxAssessedValue: f.maxAssessedValue,
              excludeFloodZone: f.excludeFloodZone,
            },
          }),
        });
        if (!res.ok) throw new Error("Search failed");
        const data = await res.json();
        setAllParcels(data.parcels || []);
        setParcels(data.parcels || []);
        setSelectedIds(new Set());
      } catch {
        setParcels([]);
        setAllParcels([]);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const handlePolygonDrawn = useCallback(
    (coords: number[][][]) => {
      setPolygon(coords);
      searchParcels(coords, filters);
    },
    [filters, searchParcels]
  );

  const handleFiltersChange = useCallback(
    (newFilters: ProspectFilterState) => {
      setFilters(newFilters);
      if (polygon) {
        searchParcels(polygon, newFilters);
      }
    },
    [polygon, searchParcels]
  );

  const handleClear = useCallback(() => {
    setPolygon(null);
    setParcels([]);
    setAllParcels([]);
    setSearched(false);
    setSelectedIds(new Set());
  }, []);

  return (
    <DashboardShell>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MapPin className="h-6 w-6" />
            Prospecting
          </h1>
          <p className="text-sm text-muted-foreground">
            Draw an area on the map to find parcels. Filter, select, and create deals in bulk.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          {/* Map */}
          <div>
            <ProspectMap
              parcels={parcels}
              polygon={polygon}
              onPolygonDrawn={handlePolygonDrawn}
              onClear={handleClear}
              selectedIds={selectedIds}
            />
            {loading && (
              <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Searching parcels in area...
              </div>
            )}
            {searched && !loading && (
              <p className="mt-2 text-sm text-muted-foreground">
                {parcels.length} parcel{parcels.length !== 1 ? "s" : ""} found
              </p>
            )}
          </div>

          {/* Filters panel */}
          <ProspectFilters
            filters={filters}
            onChange={handleFiltersChange}
            disabled={!polygon}
          />
        </div>

        {/* Results table */}
        {searched && (
          <ProspectResults
            parcels={parcels}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            polygon={polygon}
          />
        )}
      </div>
    </DashboardShell>
  );
}
