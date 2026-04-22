"use client";

import {
  useCallback,
  useState,
} from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Loader2, X } from "lucide-react";
import { ProspectFilters, type ProspectFilterState } from "@/components/prospecting/ProspectFilters";
import {
  ProspectResults,
  type ProspectParcel,
} from "@/components/prospecting/ProspectResults";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

const PANEL_WIDTH = 420;
const PANEL_TRANSITION = { duration: 0.28, ease: [0.22, 1, 0.36, 1] as const };

interface MapProspectingPanelProps {
  polygon: number[][][] | null;
  onClose?: () => void;
}

/**
 * Slide-in prospecting panel for filtering and searching parcels within a drawn polygon.
 */
export function MapProspectingPanel({
  polygon,
  onClose,
}: MapProspectingPanelProps) {
  const reduceMotion = useReducedMotion();
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
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1.5">
              <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-map-text-muted">
                Prospecting scan
              </p>
              <h3 className="text-sm font-semibold text-map-text-primary">
                Surface parcels that match the boundary.
              </h3>
              <p className="text-[11px] leading-5 text-map-text-secondary">
                Filter the drawn geography by acreage, zoning, flood exposure, and value, then move the best candidates back into the working set.
              </p>
            </div>
            {onClose ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="h-8 w-8 shrink-0 text-map-text-muted hover:text-map-text-primary"
                aria-label="Close prospecting scan"
              >
                <X className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant="outline" className="px-2.5 py-1 text-[9px]">
              {panelLabel}
            </Badge>
            <Badge variant="outline" className="px-2.5 py-1 text-[9px]">
              {polygon ? "Boundary active" : "Boundary required"}
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
              {loading ? "Running scan..." : "Run prospecting scan"}
            </Button>

            {searched && (
              <div className="pt-1">
                <Separator className="mb-4 bg-map-border" />
                <h4 className="mb-2 text-xs font-semibold text-map-text-primary">
                  Results ({parcels.length})
                </h4>
                {parcels.length === 0 ? (
                  <p className="text-[10px] text-map-text-muted">
                    No parcels match the current scan.
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
              <div className="rounded-lg border border-map-border bg-map-surface px-3 py-2 text-[10px] text-map-text-muted">
                Draw a boundary on the map to activate prospecting filters.
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </motion.div>
  );
}
