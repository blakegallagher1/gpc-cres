import { useState, useEffect, useRef, useCallback } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParcelGeometryEntry {
  geometry: { type: string; coordinates: unknown };
  bbox: [number, number, number, number];
  area_sqft: number;
}

export interface ViewportBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

// ---------------------------------------------------------------------------
// Hook: fetch GeoJSON geometries for enriched parcels
// ---------------------------------------------------------------------------

/**
 * Fetches parcel polygon geometries from the chatgpt-apps proxy.
 * Only fetches for parcels that have a `propertyDbId` (linked to LA Property DB).
 * Batches requests in groups of 5 with 200ms inter-batch delay to respect rate limits.
 *
 * When `viewportBounds` is provided, only parcels whose lat/lng fall within
 * the bounds (plus a small padding buffer) are fetched. This prevents wasting
 * bandwidth on off-screen parcels.
 *
 * Uses an AbortController to cancel stale fetches when bounds change.
 */
export function useParcelGeometry(
  parcels: Array<{
    id: string;
    lat?: number;
    lng?: number;
    propertyDbId?: string | null;
    geometryLookupKey?: string | null;
  }>,
  maxFetch: number = 50,
  viewportBounds?: ViewportBounds | null
): { geometries: Map<string, ParcelGeometryEntry>; loading: boolean } {
  const [geometries, setGeometries] = useState<Map<string, ParcelGeometryEntry>>(
    new Map()
  );
  const [loading, setLoading] = useState(false);
  const fetchedRef = useRef(new Set<string>());
  const abortRef = useRef<AbortController | null>(null);

  const fetchGeometries = useCallback(async () => {
    // Abort any in-flight fetch cycle
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    let candidates = parcels.filter(
      (p) => (p.propertyDbId || p.geometryLookupKey) && !fetchedRef.current.has(p.id)
    );

    // Viewport filtering: only fetch parcels within bounds + padding
    if (viewportBounds && candidates.length > 0) {
      const PAD_DEG = 0.01; // ~1.1 km padding
      const west = viewportBounds.west - PAD_DEG;
      const east = viewportBounds.east + PAD_DEG;
      const south = viewportBounds.south - PAD_DEG;
      const north = viewportBounds.north + PAD_DEG;

      candidates = candidates.filter((p) => {
        if (p.lat == null || p.lng == null) return true; // fetch if no coords
        return p.lng >= west && p.lng <= east && p.lat >= south && p.lat <= north;
      });
    }

    const toFetch = candidates.slice(0, maxFetch);

    if (toFetch.length === 0) return;

    setLoading(true);

    // Mark as in-flight to prevent duplicate fetches
    for (const p of toFetch) fetchedRef.current.add(p.id);

    const BATCH_SIZE = 5;

    for (let i = 0; i < toFetch.length; i += BATCH_SIZE) {
      // Check if aborted between batches
      if (controller.signal.aborted) {
        // Un-mark parcels so they can be re-fetched next cycle
        for (const p of toFetch.slice(i)) fetchedRef.current.delete(p.id);
        break;
      }

      const batch = toFetch.slice(i, i + BATCH_SIZE);

      const results = await Promise.allSettled(
        batch.map(async (parcel) => {
          const lookupKey =
            parcel.geometryLookupKey?.trim() ||
            parcel.propertyDbId?.trim() ||
            parcel.id;
          const cleanedLookupKey = lookupKey.replace(/^ext-/, "");

          const res = await fetch("/api/external/chatgpt-apps/parcel-geometry", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              parcelId: cleanedLookupKey,
              detailLevel: "low",
            }),
            signal: controller.signal,
          });
          if (!res.ok) return null;
          const json = await res.json();
          if (!json.ok || !json.data?.geom_simplified) return null;

          let parsedGeometry: unknown = json.data.geom_simplified;
          if (typeof parsedGeometry === "string") {
            try {
              parsedGeometry = JSON.parse(parsedGeometry);
            } catch {
              // Some responses return malformed JSON with escaped payloads;
              // treat those as unavailable rather than fail the full request batch.
              return null;
            }
          }

          if (
            !parsedGeometry ||
            typeof parsedGeometry !== "object" ||
            Array.isArray(parsedGeometry)
          ) {
            return null;
          }

          const geomType = (parsedGeometry as { type?: unknown }).type;
          if (geomType !== "Polygon" && geomType !== "MultiPolygon") {
            return null;
          }

          return {
            parcelId: parcel.id,
            entry: {
              geometry: parsedGeometry as {
                type: "Polygon" | "MultiPolygon";
                coordinates: unknown;
              },
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

    if (!controller.signal.aborted) {
      setLoading(false);
    }
  }, [parcels, maxFetch, viewportBounds]);

  useEffect(() => {
    fetchGeometries();
    return () => {
      abortRef.current?.abort();
    };
  }, [fetchGeometries]);

  return { geometries, loading };
}
