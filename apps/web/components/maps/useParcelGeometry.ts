import { useState, useEffect, useRef, useCallback } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParcelGeometryEntry {
  geometry: { type: string; coordinates: unknown };
  bbox: [number, number, number, number];
  area_sqft: number;
}

// ---------------------------------------------------------------------------
// Hook: fetch GeoJSON geometries for enriched parcels
// ---------------------------------------------------------------------------

/**
 * Fetches parcel polygon geometries from the chatgpt-apps proxy.
 * Only fetches for parcels that have a `propertyDbId` (linked to LA Property DB).
 * Batches requests in groups of 5 with 200ms inter-batch delay to respect rate limits.
 */
export function useParcelGeometry(
  parcels: Array<{ id: string; propertyDbId?: string | null }>,
  maxFetch: number = 50
): { geometries: Map<string, ParcelGeometryEntry>; loading: boolean } {
  const [geometries, setGeometries] = useState<Map<string, ParcelGeometryEntry>>(
    new Map()
  );
  const [loading, setLoading] = useState(false);
  const fetchedRef = useRef(new Set<string>());

  const fetchGeometries = useCallback(async () => {
    const toFetch = parcels
      .filter((p) => p.propertyDbId && !fetchedRef.current.has(p.id))
      .slice(0, maxFetch);

    if (toFetch.length === 0) return;

    setLoading(true);

    // Mark as in-flight to prevent duplicate fetches
    for (const p of toFetch) fetchedRef.current.add(p.id);

    const BATCH_SIZE = 5;

    for (let i = 0; i < toFetch.length; i += BATCH_SIZE) {
      const batch = toFetch.slice(i, i + BATCH_SIZE);

      const results = await Promise.allSettled(
        batch.map(async (parcel) => {
          const res = await fetch("/api/external/chatgpt-apps/parcel-geometry", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              parcelId: parcel.propertyDbId,
              detailLevel: "low",
            }),
          });
          if (!res.ok) return null;
          const json = await res.json();
          if (!json.ok || !json.data?.geom_simplified) return null;

          const geom =
            typeof json.data.geom_simplified === "string"
              ? JSON.parse(json.data.geom_simplified)
              : json.data.geom_simplified;

          return {
            parcelId: parcel.id,
            entry: {
              geometry: geom as { type: string; coordinates: unknown },
              bbox: json.data.bbox as [number, number, number, number],
              area_sqft: json.data.area_sqft as number,
            },
          };
        })
      );

      // Merge successful results into state
      const newEntries = new Map<string, ParcelGeometryEntry>();
      for (const result of results) {
        if (result.status === "fulfilled" && result.value) {
          newEntries.set(result.value.parcelId, result.value.entry);
        }
      }
      if (newEntries.size > 0) {
        setGeometries((prev) => {
          const next = new Map(prev);
          for (const [k, v] of newEntries) next.set(k, v);
          return next;
        });
      }

      // Small delay between batches to stay within rate limits
      if (i + BATCH_SIZE < toFetch.length) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    setLoading(false);
  }, [parcels, maxFetch]);

  useEffect(() => {
    fetchGeometries();
  }, [fetchGeometries]);

  return { geometries, loading };
}
