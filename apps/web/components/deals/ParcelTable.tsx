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
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Address</TableHead>
          <TableHead>APN</TableHead>
          <TableHead>Zoning</TableHead>
          <TableHead>Flood Zone</TableHead>
          <TableHead className="text-right">Acreage</TableHead>
          <TableHead className="text-right w-[100px]">Enrich</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {parcels.map((parcel) => {
          const isEnriched = !!parcel.propertyDbId;
          const isEnriching = enrichingId === parcel.id;

          return (
            <TableRow key={parcel.id}>
              <TableCell className="font-medium">{parcel.address}</TableCell>
              <TableCell>{parcel.apn ?? "--"}</TableCell>
              <TableCell>{parcel.currentZoning ?? "--"}</TableCell>
              <TableCell>{parcel.floodZone ?? "--"}</TableCell>
              <TableCell className="text-right">
                {parcel.acreage != null
                  ? Number(parcel.acreage).toFixed(2)
                  : "--"}
              </TableCell>
              <TableCell className="text-right">
                {isEnriched ? (
                  <span className="inline-flex items-center gap-1 text-xs text-green-600">
                    <Check className="h-3.5 w-3.5" />
                    Done
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 text-xs"
                    disabled={isEnriching}
                    onClick={() => handleEnrich(parcel)}
                  >
                    {isEnriching ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    {isEnriching ? "Scanning..." : "Enrich"}
                  </Button>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
