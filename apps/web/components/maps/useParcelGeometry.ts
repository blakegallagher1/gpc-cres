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

type ParcelGeometryErrorResponse = {
  ok?: boolean;
  request_id?: string;
  error?: {
    code?: string;
    message?: string;
  };
  debug?: {
    upstream_status?: number;
    upstream_error?: string;
    parcel_id?: string;
  };
};

type GeometryFetchHealth = {
  failedCount: number;
  unauthorized: boolean;
  rateLimited: boolean;
  propertyDbUnconfigured: boolean;
  upstreamError: boolean;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  lastRequestId: string | null;
};

type PolygonGeometry = {
  type: "Polygon" | "MultiPolygon";
  coordinates: unknown;
};

function extractPolygonGeometry(input: unknown): PolygonGeometry | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const record = input as {
    type?: unknown;
    coordinates?: unknown;
    geometry?: unknown;
    features?: unknown;
    geometries?: unknown;
  };

  if ((record.type === "Polygon" || record.type === "MultiPolygon") && Array.isArray(record.coordinates)) {
    return {
      type: record.type,
      coordinates: record.coordinates,
    };
  }

  if (record.type === "Feature") {
    return extractPolygonGeometry(record.geometry);
  }

  if (record.type === "FeatureCollection" && Array.isArray(record.features)) {
    for (const feature of record.features) {
      const geometry = extractPolygonGeometry(feature);
      if (geometry) return geometry;
    }
    return null;
  }

  if (record.type === "GeometryCollection" && Array.isArray(record.geometries)) {
    for (const geometry of record.geometries) {
      const parsed = extractPolygonGeometry(geometry);
      if (parsed) return parsed;
    }
    return null;
  }

  return null;
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
): {
  geometries: Map<string, ParcelGeometryEntry>;
  loading: boolean;
  health: GeometryFetchHealth;
} {
  const [geometries, setGeometries] = useState<Map<string, ParcelGeometryEntry>>(
    new Map()
  );
  const [loading, setLoading] = useState(false);
  const [health, setHealth] = useState<GeometryFetchHealth>({
    failedCount: 0,
    unauthorized: false,
    rateLimited: false,
    propertyDbUnconfigured: false,
    upstreamError: false,
    lastErrorCode: null,
    lastErrorMessage: null,
    lastRequestId: null,
  });
  const [fetchCycle, setFetchCycle] = useState(0);
  const abortNetworkRequests = process.env.NODE_ENV === "production";
  const fetchedRef = useRef(new Set<string>());
  const inFlightRef = useRef(new Set<string>());
  const attemptsRef = useRef(new Map<string, number>());
  const abortRef = useRef<AbortController | null>(null);
  const isFetchingRef = useRef(false);
  const pendingFetchRef = useRef(false);

  const collectCandidates = useCallback(() => {
    let candidates = parcels.filter(
      (p) =>
        (p.propertyDbId || p.geometryLookupKey) &&
        !fetchedRef.current.has(p.id) &&
        !inFlightRef.current.has(p.id) &&
        (attemptsRef.current.get(p.id) ?? 0) < 3
    );

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

    return candidates;
  }, [parcels, viewportBounds]);

  const fetchGeometries = useCallback(async () => {
    if (isFetchingRef.current) {
      pendingFetchRef.current = true;
      return;
    }
    isFetchingRef.current = true;

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const candidates = collectCandidates();

      const toFetch = candidates.slice(0, maxFetch);

      if (toFetch.length === 0) return;

      setLoading(true);

      // Mark as in-flight to prevent duplicate fetches while requests are pending.
      for (const p of toFetch) inFlightRef.current.add(p.id);

      const BATCH_SIZE = 5;

      for (let i = 0; i < toFetch.length; i += BATCH_SIZE) {
        // Check if aborted between batches
        if (controller.signal.aborted) {
          // Un-mark parcels so they can be re-fetched next cycle
          for (const p of toFetch.slice(i)) inFlightRef.current.delete(p.id);
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
            ...(abortNetworkRequests ? { signal: controller.signal } : {}),
          });
          let json: ParcelGeometryErrorResponse;
          try {
            json = (await res.json()) as ParcelGeometryErrorResponse;
          } catch {
            if (process.env.NODE_ENV !== "production") {
              console.warn("[useParcelGeometry] Non-JSON parcel geometry response", {
                parcelId: parcel.id,
                lookupKey: cleanedLookupKey,
                status: res.status,
              });
            }
            return null;
          }

          if (!res.ok || !json.ok) {
            const errorCode = json.error?.code ?? null;
            const errorMessage = json.error?.message ?? null;
            if (errorCode === "CLIENT_ABORTED") {
              return null;
            }
            setHealth((prev) => ({
              failedCount: prev.failedCount + 1,
              unauthorized: prev.unauthorized || res.status === 401 || errorCode === "UNAUTHORIZED",
              rateLimited: prev.rateLimited || res.status === 429 || errorCode === "RATE_LIMITED",
              propertyDbUnconfigured:
                prev.propertyDbUnconfigured || errorCode === "PROPERTY_DB_UNCONFIGURED",
              upstreamError:
                prev.upstreamError ||
                errorCode === "UPSTREAM_ERROR" ||
                errorCode === "PROPERTY_DB_UNCONFIGURED",
              lastErrorCode: errorCode,
              lastErrorMessage: errorMessage,
              lastRequestId: json.request_id ?? null,
            }));
            if (process.env.NODE_ENV !== "production") {
              console.warn("[useParcelGeometry] Parcel geometry request failed", {
                parcelId: parcel.id,
                lookupKey: cleanedLookupKey,
                status: res.status,
                requestId: json.request_id,
                errorCode: json.error?.code,
                errorMessage: json.error?.message,
                debug: json.debug,
              });
            }
            return null;
          }
          if (!(json as { data?: { geom_simplified?: unknown } }).data?.geom_simplified) {
            setHealth((prev) => ({
              ...prev,
              failedCount: prev.failedCount + 1,
              lastErrorCode: "MISSING_GEOMETRY",
              lastErrorMessage: "geom_simplified missing",
              lastRequestId: json.request_id ?? null,
            }));
            if (process.env.NODE_ENV !== "production") {
              console.warn("[useParcelGeometry] Parcel geometry missing geom_simplified", {
                parcelId: parcel.id,
                lookupKey: cleanedLookupKey,
                requestId: json.request_id,
              });
            }
            return null;
          }

          const geometryData = (json as {
            data: {
              geom_simplified: unknown;
              bbox: unknown;
              area_sqft: unknown;
            };
          }).data;
          let parsedGeometry: unknown = geometryData.geom_simplified;
          if (typeof parsedGeometry === "string") {
            try {
              parsedGeometry = JSON.parse(parsedGeometry);
            } catch {
              // Some responses return malformed JSON with escaped payloads;
              // treat those as unavailable rather than fail the full request batch.
              return null;
            }
          }

          const normalizedGeometry = extractPolygonGeometry(parsedGeometry);
          if (!normalizedGeometry) return null;

          return {
            parcelId: parcel.id,
            entry: {
              geometry: normalizedGeometry,
              bbox: geometryData.bbox as [number, number, number, number],
              area_sqft: geometryData.area_sqft as number,
            },
          };
          })
        );

        // Merge successful results into state
        const newEntries = new Map<string, ParcelGeometryEntry>();
        const successfulParcelIds = new Set<string>();
        const attemptedParcelIds = new Set<string>(batch.map((parcel) => parcel.id));
        for (const result of results) {
          if (result.status === "fulfilled" && result.value) {
            newEntries.set(result.value.parcelId, result.value.entry);
            successfulParcelIds.add(result.value.parcelId);
          }
        }
        if (newEntries.size > 0) {
          setGeometries((prev) => {
            const next = new Map(prev);
            for (const [k, v] of newEntries) next.set(k, v);
            return next;
          });
        }

        // Only mark as fetched after successful responses.
        for (const parcelId of attemptedParcelIds) {
          inFlightRef.current.delete(parcelId);
          attemptsRef.current.set(parcelId, (attemptsRef.current.get(parcelId) ?? 0) + 1);
        }
        for (const parcelId of successfulParcelIds) {
          fetchedRef.current.add(parcelId);
          attemptsRef.current.delete(parcelId);
        }

        // Small delay between batches to stay within rate limits
        if (i + BATCH_SIZE < toFetch.length) {
          await new Promise((r) => setTimeout(r, 200));
        }
      }

      if (!controller.signal.aborted) {
        setLoading(false);
        if (collectCandidates().length > 0) {
          setFetchCycle((cycle) => cycle + 1);
        }
      } else {
        for (const p of toFetch) inFlightRef.current.delete(p.id);
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      isFetchingRef.current = false;
      if (pendingFetchRef.current) {
        pendingFetchRef.current = false;
        setFetchCycle((cycle) => cycle + 1);
      }
    }
  }, [abortNetworkRequests, collectCandidates, maxFetch]);

  useEffect(() => {
    fetchGeometries();
  }, [fetchGeometries, fetchCycle]);

  useEffect(
    () => () => {
      if (abortNetworkRequests) {
        abortRef.current?.abort();
      }
    },
    [abortNetworkRequests]
  );

  return { geometries, loading, health };
}
