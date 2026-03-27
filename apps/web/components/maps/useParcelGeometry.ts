import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

export type GeometryLoadState = "idle" | "loading" | "ready" | "partial" | "unavailable";

export type GeometryFetchHealth = {
  failedCount: number;
  geometryUnavailable: boolean;
  unauthorized: boolean;
  rateLimited: boolean;
  propertyDbUnconfigured: boolean;
  upstreamError: boolean;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  lastRequestId: string | null;
};

export interface GeometryLoadSummary {
  status: GeometryLoadState;
  requestedCount: number;
  loadedCount: number;
  unavailableCount: number;
  pendingCount: number;
}

type ParcelGeometryCandidate = {
  id: string;
  lookupKey: string;
  lat?: number;
  lng?: number;
};

type PolygonGeometry = {
  type: "Polygon" | "MultiPolygon";
  coordinates: unknown;
};

type GeometryBatchResult =
  | {
      kind: "success";
      parcelId: string;
      lookupKey: string;
      entry: ParcelGeometryEntry;
    }
  | {
      kind: "unavailable";
      parcelId: string;
      lookupKey: string;
      requestId: string | null;
      errorCode: string | null;
      errorMessage: string | null;
    }
  | {
      kind: "failed";
      parcelId: string;
      lookupKey: string;
      requestId: string | null;
      errorCode: string | null;
      errorMessage: string | null;
      unauthorized: boolean;
      rateLimited: boolean;
      propertyDbUnconfigured: boolean;
      upstreamError: boolean;
    }
  | {
      kind: "aborted";
      parcelId: string;
      lookupKey: string;
    };

const VIEWPORT_PADDING_DEGREES = 0.01;
const MAX_RETRY_ATTEMPTS = 2;
const GEOMETRY_BATCH_SIZE = 8;
const INTER_BATCH_DELAY_MS = 50;

function extractPolygonGeometry(input: unknown): PolygonGeometry | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const record = input as {
    type?: unknown;
    coordinates?: unknown;
    geometry?: unknown;
    features?: unknown;
    geometries?: unknown;
  };

  if (
    (record.type === "Polygon" || record.type === "MultiPolygon") &&
    Array.isArray(record.coordinates)
  ) {
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

function getParcelLookupKey(parcel: {
  id: string;
  propertyDbId?: string | null;
  geometryLookupKey?: string | null;
}): string | null {
  const lookupKey = parcel.geometryLookupKey?.trim() || parcel.propertyDbId?.trim() || parcel.id;
  const normalized = lookupKey.replace(/^ext-/, "").trim();
  return normalized.length > 0 ? normalized : null;
}

function isWithinViewport(
  parcel: { lat?: number; lng?: number },
  viewportBounds?: ViewportBounds | null,
): boolean {
  if (!viewportBounds) return true;
  if (parcel.lat == null || parcel.lng == null) return true;

  const west = viewportBounds.west - VIEWPORT_PADDING_DEGREES;
  const east = viewportBounds.east + VIEWPORT_PADDING_DEGREES;
  const south = viewportBounds.south - VIEWPORT_PADDING_DEGREES;
  const north = viewportBounds.north + VIEWPORT_PADDING_DEGREES;

  return parcel.lng >= west && parcel.lng <= east && parcel.lat >= south && parcel.lat <= north;
}

function collectVisibleCandidates(
  parcels: Array<{
    id: string;
    lat?: number;
    lng?: number;
    propertyDbId?: string | null;
    geometryLookupKey?: string | null;
  }>,
  viewportBounds?: ViewportBounds | null,
): ParcelGeometryCandidate[] {
  return parcels.reduce<ParcelGeometryCandidate[]>((acc, parcel) => {
    const lookupKey = getParcelLookupKey(parcel);
    if (!lookupKey || !isWithinViewport(parcel, viewportBounds)) {
      return acc;
    }

    acc.push({
      id: parcel.id,
      lookupKey,
      lat: parcel.lat,
      lng: parcel.lng,
    });
    return acc;
  }, []);
}

export function summarizeGeometryLoad(params: {
  visibleCandidates: readonly ParcelGeometryCandidate[];
  geometries: ReadonlyMap<string, ParcelGeometryEntry>;
  geometryCacheKeys: ReadonlySet<string>;
  unavailableLookupKeys: ReadonlySet<string>;
  failedLookupKeys: ReadonlySet<string>;
  loading: boolean;
}): GeometryLoadSummary {
  const requestedCount = params.visibleCandidates.length;
  if (requestedCount === 0) {
    return {
      status: "idle",
      requestedCount: 0,
      loadedCount: 0,
      unavailableCount: 0,
      pendingCount: 0,
    };
  }

  let loadedCount = 0;
  let unavailableCount = 0;

  for (const candidate of params.visibleCandidates) {
    if (
      params.geometries.has(candidate.id) ||
      params.geometryCacheKeys.has(candidate.lookupKey)
    ) {
      loadedCount += 1;
      continue;
    }

    if (
      params.unavailableLookupKeys.has(candidate.lookupKey) ||
      params.failedLookupKeys.has(candidate.lookupKey)
    ) {
      unavailableCount += 1;
    }
  }

  const pendingCount = Math.max(requestedCount - loadedCount - unavailableCount, 0);

  if (params.loading || pendingCount > 0) {
    return {
      status: "loading",
      requestedCount,
      loadedCount,
      unavailableCount,
      pendingCount,
    };
  }

  if (loadedCount === 0 && unavailableCount > 0) {
    return {
      status: "unavailable",
      requestedCount,
      loadedCount,
      unavailableCount,
      pendingCount,
    };
  }

  if (unavailableCount > 0) {
    return {
      status: "partial",
      requestedCount,
      loadedCount,
      unavailableCount,
      pendingCount,
    };
  }

  return {
    status: "ready",
    requestedCount,
    loadedCount,
    unavailableCount,
    pendingCount,
  };
}

/**
 * Fetches parcel polygon geometries via GET /api/parcels/{parcelId}/geometry.
 * Requests are limited to the active viewport and cached by stable lookup key
 * so viewport refreshes do not restart failed geometry lookups indefinitely.
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
  viewportBounds?: ViewportBounds | null,
): {
  geometries: Map<string, ParcelGeometryEntry>;
  loading: boolean;
  health: GeometryFetchHealth;
  summary: GeometryLoadSummary;
} {
  const [geometries, setGeometries] = useState<Map<string, ParcelGeometryEntry>>(new Map());
  const [loading, setLoading] = useState(false);
  const [health, setHealth] = useState<GeometryFetchHealth>({
    failedCount: 0,
    geometryUnavailable: false,
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
  const geometryCacheRef = useRef(new Map<string, ParcelGeometryEntry>());
  const inFlightLookupKeysRef = useRef(new Set<string>());
  const unavailableLookupKeysRef = useRef(new Set<string>());
  const failedLookupKeysRef = useRef(new Set<string>());
  const attemptsRef = useRef(new Map<string, number>());
  const abortRef = useRef<AbortController | null>(null);
  const isFetchingRef = useRef(false);
  const pendingFetchRef = useRef(false);

  const visibleCandidates = useMemo(
    () => collectVisibleCandidates(parcels, viewportBounds),
    [parcels, viewportBounds],
  );

  useEffect(() => {
    if (visibleCandidates.length === 0) return;

    setGeometries((prev) => {
      let changed = false;
      const next = new Map(prev);

      for (const candidate of visibleCandidates) {
        const cachedGeometry = geometryCacheRef.current.get(candidate.lookupKey);
        if (!cachedGeometry || next.has(candidate.id)) continue;
        next.set(candidate.id, cachedGeometry);
        changed = true;
      }

      return changed ? next : prev;
    });
  }, [visibleCandidates]);

  const collectCandidates = useCallback(() => {
    return visibleCandidates.filter((candidate) => {
      if (geometries.has(candidate.id)) return false;
      if (geometryCacheRef.current.has(candidate.lookupKey)) return false;
      if (unavailableLookupKeysRef.current.has(candidate.lookupKey)) return false;
      if (failedLookupKeysRef.current.has(candidate.lookupKey)) return false;
      if (inFlightLookupKeysRef.current.has(candidate.lookupKey)) return false;
      return (attemptsRef.current.get(candidate.lookupKey) ?? 0) < MAX_RETRY_ATTEMPTS;
    });
  }, [geometries, visibleCandidates]);

  const fetchGeometries = useCallback(async () => {
    if (isFetchingRef.current) {
      pendingFetchRef.current = true;
      return;
    }

    const toFetch = collectCandidates().slice(0, maxFetch);
    if (toFetch.length === 0) {
      setLoading(false);
      return;
    }

    isFetchingRef.current = true;
    setLoading(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      for (const candidate of toFetch) {
        inFlightLookupKeysRef.current.add(candidate.lookupKey);
      }

      for (let index = 0; index < toFetch.length; index += GEOMETRY_BATCH_SIZE) {
        if (controller.signal.aborted) {
          break;
        }

        const batch = toFetch.slice(index, index + GEOMETRY_BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map(async (candidate): Promise<GeometryBatchResult> => {
            const response = await fetch(
              `/api/parcels/${encodeURIComponent(candidate.lookupKey)}/geometry?detail_level=low`,
              {
                method: "GET",
                ...(abortNetworkRequests ? { signal: controller.signal } : {}),
              },
            );

            let json: ParcelGeometryErrorResponse;
            try {
              json = (await response.json()) as ParcelGeometryErrorResponse;
            } catch {
              return {
                kind: "failed",
                parcelId: candidate.id,
                lookupKey: candidate.lookupKey,
                requestId: null,
                errorCode: "INVALID_GEOMETRY_RESPONSE",
                errorMessage: "Geometry endpoint returned a non-JSON response.",
                unauthorized: false,
                rateLimited: false,
                propertyDbUnconfigured: false,
                upstreamError: true,
              };
            }

            if (!response.ok || !json.ok) {
              const errorCode = json.error?.code ?? null;
              const errorMessage = json.error?.message ?? null;
              const geometryUnavailable =
                response.status === 404 ||
                errorCode === "NOT_FOUND" ||
                errorCode === "GEOMETRY_UNAVAILABLE";

              if (errorCode === "CLIENT_ABORTED") {
                return {
                  kind: "aborted",
                  parcelId: candidate.id,
                  lookupKey: candidate.lookupKey,
                };
              }

              if (geometryUnavailable) {
                return {
                  kind: "unavailable",
                  parcelId: candidate.id,
                  lookupKey: candidate.lookupKey,
                  requestId: json.request_id ?? null,
                  errorCode,
                  errorMessage,
                };
              }

              return {
                kind: "failed",
                parcelId: candidate.id,
                lookupKey: candidate.lookupKey,
                requestId: json.request_id ?? null,
                errorCode,
                errorMessage,
                unauthorized: response.status === 401 || errorCode === "UNAUTHORIZED",
                rateLimited: response.status === 429 || errorCode === "RATE_LIMITED",
                propertyDbUnconfigured:
                  errorCode === "PROPERTY_DB_UNCONFIGURED" ||
                  errorCode === "GATEWAY_UNCONFIGURED",
                upstreamError:
                  errorCode === "UPSTREAM_ERROR" ||
                  errorCode === "PROPERTY_DB_UNCONFIGURED" ||
                  errorCode === "GATEWAY_UNCONFIGURED" ||
                  response.status >= 500,
              };
            }

            const geometryData = (json as {
              data?: {
                geom_simplified?: unknown;
                bbox?: unknown;
                area_sqft?: unknown;
              };
            }).data;

            if (!geometryData?.geom_simplified) {
              return {
                kind: "failed",
                parcelId: candidate.id,
                lookupKey: candidate.lookupKey,
                requestId: json.request_id ?? null,
                errorCode: "MISSING_GEOMETRY",
                errorMessage: "geom_simplified missing",
                unauthorized: false,
                rateLimited: false,
                propertyDbUnconfigured: false,
                upstreamError: false,
              };
            }

            let parsedGeometry: unknown = geometryData.geom_simplified;
            if (typeof parsedGeometry === "string") {
              try {
                parsedGeometry = JSON.parse(parsedGeometry);
              } catch {
                return {
                  kind: "failed",
                  parcelId: candidate.id,
                  lookupKey: candidate.lookupKey,
                  requestId: json.request_id ?? null,
                  errorCode: "INVALID_GEOMETRY_PAYLOAD",
                  errorMessage: "geom_simplified could not be parsed",
                  unauthorized: false,
                  rateLimited: false,
                  propertyDbUnconfigured: false,
                  upstreamError: false,
                };
              }
            }

            const normalizedGeometry = extractPolygonGeometry(parsedGeometry);
            if (!normalizedGeometry) {
              return {
                kind: "failed",
                parcelId: candidate.id,
                lookupKey: candidate.lookupKey,
                requestId: json.request_id ?? null,
                errorCode: "UNSUPPORTED_GEOMETRY",
                errorMessage: "Geometry payload did not contain polygon coordinates.",
                unauthorized: false,
                rateLimited: false,
                propertyDbUnconfigured: false,
                upstreamError: false,
              };
            }

            return {
              kind: "success",
              parcelId: candidate.id,
              lookupKey: candidate.lookupKey,
              entry: {
                geometry: normalizedGeometry,
                bbox: geometryData.bbox as [number, number, number, number],
                area_sqft: Number(geometryData.area_sqft ?? 0),
              },
            };
          }),
        );

        const successfulEntries = new Map<string, ParcelGeometryEntry>();

        for (const result of results) {
          if (result.status === "rejected") {
            continue;
          }

          const batchResult = result.value;
          inFlightLookupKeysRef.current.delete(batchResult.lookupKey);

          if (batchResult.kind === "aborted") {
            continue;
          }

          const nextAttempts = (attemptsRef.current.get(batchResult.lookupKey) ?? 0) + 1;
          attemptsRef.current.set(batchResult.lookupKey, nextAttempts);

          if (batchResult.kind === "success") {
            geometryCacheRef.current.set(batchResult.lookupKey, batchResult.entry);
            successfulEntries.set(batchResult.parcelId, batchResult.entry);
            attemptsRef.current.delete(batchResult.lookupKey);
            failedLookupKeysRef.current.delete(batchResult.lookupKey);
            unavailableLookupKeysRef.current.delete(batchResult.lookupKey);
            continue;
          }

          if (batchResult.kind === "unavailable") {
            unavailableLookupKeysRef.current.add(batchResult.lookupKey);
            failedLookupKeysRef.current.delete(batchResult.lookupKey);
            attemptsRef.current.delete(batchResult.lookupKey);
            setHealth((prev) => ({
              failedCount: prev.failedCount + 1,
              geometryUnavailable: true,
              unauthorized: prev.unauthorized,
              rateLimited: prev.rateLimited,
              propertyDbUnconfigured: prev.propertyDbUnconfigured,
              upstreamError: prev.upstreamError,
              lastErrorCode: batchResult.errorCode,
              lastErrorMessage: batchResult.errorMessage,
              lastRequestId: batchResult.requestId,
            }));
            continue;
          }

          if (nextAttempts >= MAX_RETRY_ATTEMPTS) {
            failedLookupKeysRef.current.add(batchResult.lookupKey);
          }

          setHealth((prev) => ({
            failedCount: prev.failedCount + 1,
            geometryUnavailable: prev.geometryUnavailable,
            unauthorized: prev.unauthorized || batchResult.unauthorized,
            rateLimited: prev.rateLimited || batchResult.rateLimited,
            propertyDbUnconfigured:
              prev.propertyDbUnconfigured || batchResult.propertyDbUnconfigured,
            upstreamError: prev.upstreamError || batchResult.upstreamError,
            lastErrorCode: batchResult.errorCode,
            lastErrorMessage: batchResult.errorMessage,
            lastRequestId: batchResult.requestId,
          }));
        }

        if (successfulEntries.size > 0) {
          setGeometries((prev) => {
            const next = new Map(prev);
            for (const [parcelId, entry] of successfulEntries) {
              next.set(parcelId, entry);
            }
            return next;
          });
        }

        if (index + GEOMETRY_BATCH_SIZE < toFetch.length) {
          await new Promise((resolve) => setTimeout(resolve, INTER_BATCH_DELAY_MS));
        }
      }
    } finally {
      for (const candidate of toFetch) {
        inFlightLookupKeysRef.current.delete(candidate.lookupKey);
      }

      if (abortRef.current === controller) {
        abortRef.current = null;
      }

      isFetchingRef.current = false;
      const hasMoreCandidates = collectCandidates().length > 0;
      setLoading(false);

      if (pendingFetchRef.current) {
        pendingFetchRef.current = false;
        setFetchCycle((cycle) => cycle + 1);
      } else if (hasMoreCandidates) {
        setFetchCycle((cycle) => cycle + 1);
      }
    }
  }, [abortNetworkRequests, collectCandidates, maxFetch]);

  useEffect(() => {
    void fetchGeometries();
  }, [fetchCycle, fetchGeometries]);

  useEffect(
    () => () => {
      if (abortNetworkRequests) {
        abortRef.current?.abort();
      }
    },
    [abortNetworkRequests],
  );

  const summary = useMemo(
    () =>
      summarizeGeometryLoad({
        visibleCandidates,
        geometries,
        geometryCacheKeys: new Set(geometryCacheRef.current.keys()),
        unavailableLookupKeys: unavailableLookupKeysRef.current,
        failedLookupKeys: failedLookupKeysRef.current,
        loading,
      }),
    [geometries, health, loading, visibleCandidates],
  );

  return {
    geometries,
    loading,
    health,
    summary,
  };
}
