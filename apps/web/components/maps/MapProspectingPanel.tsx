"use client";

import {
  useCallback,
  useState,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Search, ChevronRight, ChevronLeft, Loader2 } from "lucide-react";
import { ProspectFilters, type ProspectFilterState } from "@/components/prospecting/ProspectFilters";
import { ProspectResults, type ProspectParcel } from "@/components/prospecting/ProspectResults";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
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
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen((value) => !value)}
        className="absolute right-3 top-16 z-30 h-auto justify-start gap-3 border-map-border bg-map-surface-overlay px-3 py-2 text-left text-sm font-medium text-map-text-primary shadow-xl backdrop-blur-md hover:bg-map-surface"
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
      </Button>

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
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge variant="outline" className="px-2.5 py-1 text-[9px]">
                    {panelLabel}
                  </Badge>
                </div>
              </div>

              <ScrollArea className="min-h-0 flex-1">
                <div className="flex flex-col gap-4 px-4 py-4">
                  <ProspectFilters
                    filters={filters}
                    onChange={handleFilterChange}
                    disabled={!polygon}
                  />

                  <Button
                    onClick={handleSearch}
                    disabled={!polygon || loading}
                    className="w-full bg-map-accent text-sm font-medium text-white hover:bg-map-accent/90"
                  >
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {loading ? "Searching..." : "Search"}
                  </Button>

                  {searched && (
                    <div className="pt-1">
                      <Separator className="mb-4 bg-map-border" />
                      <h4 className="mb-2 text-xs font-semibold text-map-text-primary">
                        Results ({parcels.length})
                      </h4>
                      {parcels.length === 0 ? (
                        <p className="text-[10px] text-map-text-muted">
                          No parcels match your filters
                        </p>
                      ) : (
                        <ProspectResults
                          parcels={parcels}
                          selectedIds={selectedIds}
                          onSelectionChange={setSelectedIds}
                          polygon={polygon}
                        />
                      )}
                    </div>
                  )}

                  {!polygon && (
                    <div className="rounded-lg border border-map-border bg-map-surface/50 px-3 py-2 text-[10px] text-map-text-muted">
                      Draw a polygon on the map to enable prospecting filters
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
