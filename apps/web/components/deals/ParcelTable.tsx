"use client";

import { useState } from "react";
import { Loader2, Sparkles, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

export interface ParcelItem {
  id: string;
  address: string;
  apn?: string | null;
  acreage?: string | number | null;
  currentZoning?: string | null;
  futureLandUse?: string | null;
  floodZone?: string | null;
  soilsNotes?: string | null;
  wetlandsNotes?: string | null;
  envNotes?: string | null;
  trafficNotes?: string | null;
  propertyDbId?: string | null;
}

interface ParcelTableProps {
  parcels: ParcelItem[];
  dealId: string;
  onParcelUpdated?: (parcel: ParcelItem) => void;
}

export function ParcelTable({ parcels, dealId, onParcelUpdated }: ParcelTableProps) {
  const [enrichingId, setEnrichingId] = useState<string | null>(null);

  const handleEnrich = async (parcel: ParcelItem) => {
    setEnrichingId(parcel.id);
    try {
      // Step 1: Search for matches
      const searchRes = await fetch(
        `/api/deals/${dealId}/parcels/${parcel.id}/enrich`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "search" }),
        }
      );

      if (!searchRes.ok) throw new Error("Search failed");
      const { matches } = await searchRes.json();

      if (!matches || matches.length === 0) {
        toast.error("No matches found in the property database for this address.");
        return;
      }

      // Auto-select first match and apply enrichment
      const bestMatch = matches[0];
      toast.info(
        `Found match: ${bestMatch.situs_address} (Owner: ${bestMatch.owner_name}). Enriching...`
      );

      // Step 2: Apply enrichment
      const applyRes = await fetch(
        `/api/deals/${dealId}/parcels/${parcel.id}/enrich`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "apply",
            propertyDbId: bestMatch.id,
          }),
        }
      );

      if (!applyRes.ok) throw new Error("Enrichment failed");
      const { parcel: updated } = await applyRes.json();
      toast.success("Parcel enriched with property database data and site screening.");
      onParcelUpdated?.(updated);
    } catch (err) {
      console.error("Enrich error:", err);
      toast.error("Failed to enrich parcel. Check console for details.");
    } finally {
      setEnrichingId(null);
    }
  };

  if (parcels.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No parcels added yet. Add a parcel to get started.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {parcels.map((parcel) => {
        const isEnriched = !!parcel.propertyDbId;
        const isEnriching = enrichingId === parcel.id;

        return (
          <div key={parcel.id} className="rounded-lg border p-4 space-y-3">
            {/* Row 1: Address + Enrich button */}
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium text-sm truncate">{parcel.address}</span>
              {isEnriched ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">
                  <Check className="h-3.5 w-3.5" />
                  Enriched
                </span>
              ) : (
                <Button
                  size="sm"
                  variant="default"
                  className="shrink-0 gap-1.5"
                  disabled={isEnriching}
                  onClick={() => handleEnrich(parcel)}
                >
                  {isEnriching ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  {isEnriching ? "Scanning..." : "Enrich"}
                </Button>
              )}
            </div>

            {/* Row 2: Data fields grid */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
              <div>
                <span className="text-muted-foreground text-xs">APN</span>
                <p className="font-mono text-xs">{parcel.apn ?? "--"}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Zoning</span>
                <p className="text-xs">{parcel.currentZoning ?? "--"}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Flood Zone</span>
                <p className="text-xs">{parcel.floodZone ?? "--"}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Acreage</span>
                <p className="text-xs">
                  {parcel.acreage != null
                    ? Number(parcel.acreage).toFixed(2)
                    : "--"}
                </p>
              </div>
            </div>

            {/* Row 3: Screening notes (only shown if enriched) */}
            {isEnriched && (parcel.soilsNotes || parcel.wetlandsNotes || parcel.envNotes || parcel.trafficNotes) && (
              <div className="grid gap-1 text-xs border-t pt-2">
                {parcel.soilsNotes && (
                  <p><span className="font-medium text-muted-foreground">Soils:</span> {parcel.soilsNotes}</p>
                )}
                {parcel.wetlandsNotes && (
                  <p><span className="font-medium text-muted-foreground">Wetlands:</span> {parcel.wetlandsNotes}</p>
                )}
                {parcel.envNotes && (
                  <p className="whitespace-pre-line"><span className="font-medium text-muted-foreground">Environmental:</span> {parcel.envNotes}</p>
                )}
                {parcel.trafficNotes && (
                  <p><span className="font-medium text-muted-foreground">Traffic:</span> {parcel.trafficNotes}</p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
