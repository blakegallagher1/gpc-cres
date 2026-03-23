"use client";

import {
  useCallback,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Search, ChevronRight, ChevronLeft, Loader2 } from "lucide-react";
import { ProspectFilters, type ProspectFilterState } from "@/components/prospecting/ProspectFilters";
import { ProspectResults, type ProspectParcel } from "@/components/prospecting/ProspectResults";
import { toast } from "sonner";

const PANEL_WIDTH = 420;
const PANEL_TRANSITION = { duration: 0.28, ease: [0.22, 1, 0.36, 1] as const };

interface MapProspectingPanelProps {
  polygon: number[][][] | null;
  onParcelSelect?: (parcel: ProspectParcel) => void;
}

/**
 * Slide-in prospecting panel for filtering and searching parcels within a drawn polygon.
 */
export function MapProspectingPanel({
  polygon,
  onParcelSelect,
}: MapProspectingPanelProps) {
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [filters, setFilters] = useState<ProspectFilterState>({
    searchText: "",
    zoningCodes: [],
    minAcreage: undefined,
    maxAcreage: undefined,
    minAssessedValue: undefined,
    maxAssessedValue: undefined,
    excludeFloodZone: false,
  });
  const [parcels, setParcels] = useState<ProspectParcel[]>([]);
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
              searchText: f.searchText.trim() || undefined,
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
        setParcels(data.parcels || []);
        setSelectedIds(new Set());
      } catch {
        toast.error("Failed to search parcels. Please try again.");
        setParcels([]);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const handleSearch = useCallback(async () => {
    if (!polygon) {
      toast.error("Draw a polygon on the map to search");
      return;
    }
    await searchParcels(polygon, filters);
  }, [polygon, filters, searchParcels]);

  const handleFilterChange = useCallback((newFilters: ProspectFilterState) => {
    setFilters(newFilters);
  }, []);

  const panelLabel = polygon
    ? `${searched ? parcels.length : "0"} parcels ${searched ? "found" : "available"}`
    : "Draw polygon to search";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="absolute right-3 top-16 z-30 flex items-center gap-3 rounded-2xl border border-map-border bg-map-surface-overlay px-3 py-2 text-left text-sm font-medium text-map-text-primary shadow-xl backdrop-blur-md transition-colors hover:bg-map-surface"
        title={open ? "Close Prospecting" : "Open Prospecting"}
      >
        <div className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-map-border bg-map-surface/70">
          <Search className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold">Prospecting</div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-map-text-muted">
            {panelLabel}
          </div>
        </div>
        {open ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, x: PANEL_WIDTH * 0.18 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: PANEL_WIDTH * 0.18 }}
            transition={PANEL_TRANSITION}
            className="absolute right-0 top-16 z-20 flex h-[calc(100%-4rem)] flex-col map-panel rounded-none shadow-2xl"
            style={{ width: `min(${PANEL_WIDTH}px, calc(100vw - 1rem))` }}
          >
            <div className="flex flex-1 flex-col overflow-hidden">
              <div className="border-b border-map-border px-4 py-4">
                <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-map-text-muted">
                  Prospecting
                </p>
                <h3 className="mt-1 text-sm font-semibold text-map-text-primary">
                  Filter parcels within the polygon
                </h3>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 space-y-4">
                {/* Filters */}
                <ProspectFilters
                  filters={filters}
                  onChange={handleFilterChange}
                  disabled={!polygon}
                />

                {/* Search Button */}
                <button
                  onClick={handleSearch}
                  disabled={!polygon || loading}
                  className="w-full rounded-lg bg-map-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-map-accent/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  {loading ? "Searching..." : "Search"}
                </button>

                {/* Results */}
                {searched && (
                  <div className="border-t border-map-border pt-4">
                    <h4 className="text-xs font-semibold text-map-text-primary mb-2">
                      Results ({parcels.length})
                    </h4>
                    {parcels.length === 0 ? (
                      <p className="text-[10px] text-map-text-muted">
                        No parcels match your filters
                      </p>
                    ) : (
                      <div className="space-y-1 max-h-64 overflow-y-auto">
                        <ProspectResults
                          parcels={parcels}
                          selectedIds={selectedIds}
                          onSelectionChange={setSelectedIds}
                          polygon={polygon}
                        />
                      </div>
                    )}
                  </div>
                )}

                {!polygon && (
                  <div className="rounded-lg border border-map-border bg-map-surface/50 px-3 py-2 text-[10px] text-map-text-muted">
                    Draw a polygon on the map to enable prospecting filters
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
