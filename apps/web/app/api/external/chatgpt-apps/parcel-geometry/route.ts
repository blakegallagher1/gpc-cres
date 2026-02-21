import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import * as Sentry from "@sentry/nextjs";
import { checkRateLimit } from "@/lib/server/rateLimiter";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import {
  getPropertyDbConfigOrNull,
  logPropertyDbRuntimeHealth,
} from "@/lib/server/propertyDbEnv";
import {
  getDevFallbackParcelByPropertyDbId,
  isDevParcelFallbackEnabled,
} from "@/lib/server/devParcelFallback";
import { propertyDbRpc } from "@entitlement-os/openai";

export const runtime = "nodejs";

const ROUTE_KEY = "parcel-geometry";
const MAX_JSON_BODY_BYTES = 20_000;

const BodySchema = z.object({
  parcelId: z.string().min(1),
  detailLevel: z.enum(["low", "medium", "high"]).default("low"),
});

type ParcelGeometry = {
  bbox: [number, number, number, number];
  centroid: { lat: number; lng: number };
  area_sqft: number;
  geom_simplified: string | null;
  srid: number;
  dataset_version: string;
};

type GeoJsonGeometry = {
  type: "Polygon" | "MultiPolygon";
  coordinates: unknown;
};

function logParcelGeometryDevPayload(
  phase: string,
  details: Record<string, unknown>,
): void {
  if (process.env.NODE_ENV === "production") return;
  console.info("[/api/external/chatgpt-apps/parcel-geometry][dev-payload]", {
    phase,
    ...details,
  });
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeRpcRows(value: unknown): Record<string, unknown>[] {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value
      .filter(
        (item): item is Record<string, unknown> =>
          item !== null && typeof item === "object" && !Array.isArray(item),
      )
      .map((item) => item as Record<string, unknown>);
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.data)) return normalizeRpcRows(record.data);
    if (Array.isArray(record.rows)) return normalizeRpcRows(record.rows);
    if (Array.isArray(record.result)) return normalizeRpcRows(record.result);
    if (Array.isArray(record.items)) return normalizeRpcRows(record.items);
    if (record.error != null) return [];

    return [record];
  }

  return [];
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseGeometry(value: unknown): GeoJsonGeometry | null {
  let candidate = value;
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return null;
    }
  }
  const record = toRecord(candidate);
  if (!record) return null;
  const type = record.type;
  if (type === "Polygon" || type === "MultiPolygon") {
    if (!Array.isArray(record.coordinates)) return null;
    return { type, coordinates: record.coordinates };
  }

  if (type === "Feature") {
    return parseGeometry(record.geometry);
  }
  if (type === "FeatureCollection" && Array.isArray(record.features)) {
    for (const feature of record.features) {
      const geometry = parseGeometry(feature);
      if (geometry) return geometry;
    }
    return null;
  }
  if (type === "GeometryCollection" && Array.isArray(record.geometries)) {
    for (const geometry of record.geometries) {
      const parsed = parseGeometry(geometry);
      if (parsed) return parsed;
    }
    return null;
  }

  return null;
}

function isAbortLikeError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { name?: unknown; code?: unknown; message?: unknown };
  if (err.name === "AbortError") return true;
  if (err.code === "ECONNRESET") return true;
  if (typeof err.message === "string" && err.message.toLowerCase().includes("aborted")) {
    return true;
  }
  return false;
}

function collectCoordinatePairs(value: unknown, pairs: Array<[number, number]>) {
  if (!Array.isArray(value)) return;
  if (
    value.length >= 2 &&
    typeof value[0] === "number" &&
    Number.isFinite(value[0]) &&
    typeof value[1] === "number" &&
    Number.isFinite(value[1])
  ) {
    pairs.push([value[0], value[1]]);
    return;
  }
  for (const next of value) {
    collectCoordinatePairs(next, pairs);
  }
}

function bboxFromGeometry(geometry: GeoJsonGeometry): [number, number, number, number] | null {
  const pairs: Array<[number, number]> = [];
  collectCoordinatePairs(geometry.coordinates, pairs);
  if (pairs.length === 0) return null;
  let minLng = Number.POSITIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  for (const [lng, lat] of pairs) {
    minLng = Math.min(minLng, lng);
    minLat = Math.min(minLat, lat);
    maxLng = Math.max(maxLng, lng);
    maxLat = Math.max(maxLat, lat);
  }
  return [minLng, minLat, maxLng, maxLat];
}

function parseBbox(value: unknown): [number, number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 4) return null;
  const minLng = toFiniteNumber(value[0]);
  const minLat = toFiniteNumber(value[1]);
  const maxLng = toFiniteNumber(value[2]);
  const maxLat = toFiniteNumber(value[3]);
  if (minLng == null || minLat == null || maxLng == null || maxLat == null) return null;
  return [minLng, minLat, maxLng, maxLat];
}

function candidateParcelKeys(row: Record<string, unknown>): string[] {
  const candidates = new Set<string>();
  const push = (value: unknown) => {
    if (typeof value !== "string") return;
    const trimmed = value.trim();
    if (trimmed.length > 0) candidates.add(trimmed);
  };
  push(row.id);
  push(row.parcel_id);
  push(row.parcel_uid);
  push(row.apn);
  push(row.parcel_number);
  push(row.site_address);
  push(row.situs_address);
  const parcelData = toRecord(row.parcel_data);
  if (parcelData) {
    push(parcelData.id);
    push(parcelData.parcel_id);
    push(parcelData.parcel_uid);
    push(parcelData.apn);
    push(parcelData.parcel_number);
    push(parcelData.site_address);
    push(parcelData.situs_address);
  }
  return Array.from(candidates);
}

function normalizeCandidateKey(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  const out = new Set<string>();
  out.add(trimmed);
  out.add(trimmed.replace(/^ext-/, ""));
  out.add(trimmed.replace(/[\s,_-]+/g, " "));
  const normalized = trimmed.toLowerCase();
  out.add(normalized);
  out.add(normalized.replace(/[^a-z0-9]/g, ""));
  out.add(normalized.replace(/[^a-z0-9\s]/g, " ").trim());
  return Array.from(out).filter((entry) => entry.length > 0);
}

function addAddressFallback(candidates: Set<string>, row: Record<string, unknown>, input: string) {
  const address = String(row.site_address ?? row.situs_address ?? "").trim();
  if (address.length > 0) candidates.add(address);
  const fallbackAddress = input.trim();
  if (fallbackAddress.length > 0) candidates.add(fallbackAddress);
}

async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  maxConcurrent: number = 5,
): Promise<PromiseSettledResult<T>[]> {
  const limit = Math.max(1, maxConcurrent);
  const results: Array<PromiseSettledResult<T>> = new Array(tasks.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < tasks.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      try {
        const value = await tasks[currentIndex]();
        results[currentIndex] = { status: "fulfilled", value };
      } catch (reason) {
        results[currentIndex] = { status: "rejected", reason };
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, () => worker()),
  );
  return results;
}

async function resolveGeometryFallback(candidateId: string): Promise<ParcelGeometry | null> {
  logPropertyDbRuntimeHealth("/api/external/chatgpt-apps/parcel-geometry");

  const rpcIds = normalizeCandidateKey(candidateId);
  const tried = new Set<string>();

  for (const rawId of rpcIds) {
    const normalized = rawId.replace(/^ext-/, "").trim();
    if (!normalized || tried.has(normalized)) continue;
    tried.add(normalized);

    const geometryAttempts = [
      normalized,
      normalized.toLowerCase(),
      normalized.toUpperCase(),
      normalized.replace(/-/g, ""),
      normalized.replace(/[\s,_-]/g, " "),
    ];

    const directGeometryRaw = await propertyDbRpc("api_get_parcel", {
      parcel_id: normalized,
    });
    const directGeometryRows = normalizeRpcRows(directGeometryRaw);
    const directGeometryFallback = deriveFallbackParcelGeometry(directGeometryRows);
    if (directGeometryFallback) return directGeometryFallback;

    const normalizedLookupTasks = geometryAttempts
      .filter((id) => Boolean(id && id.trim()))
      .map((id) => async () => {
        const response = await propertyDbRpc("api_search_parcels", {
          search_text: id,
          limit_rows: 5,
        });
        return deriveFallbackParcelGeometry(response);
      });

    const normalizedLookupResults = await runWithConcurrency(normalizedLookupTasks, 5);
    const normalizedGeometry = normalizedLookupResults.find(
      (result): result is PromiseFulfilledResult<ParcelGeometry | null> =>
        result.status === "fulfilled" && result.value !== null,
    )?.value;
    if (normalizedGeometry) return normalizedGeometry;

    const rpcLookupTasks = geometryAttempts
      .filter((id) => Boolean(id && id.trim()))
      .map((id) => async () => {
        const geometryRpcRaw = await propertyDbRpc("rpc_get_parcel_geometry", {
          parcel_id: id,
        });
        return deriveFallbackParcelGeometry(geometryRpcRaw);
      });
    const rpcLookupResults = await runWithConcurrency(rpcLookupTasks, 5);
    const rpcGeometry = rpcLookupResults.find(
      (result): result is PromiseFulfilledResult<ParcelGeometry | null> =>
        result.status === "fulfilled" && result.value !== null,
    )?.value;
    if (rpcGeometry) return rpcGeometry;

    const fromParcel = deriveFallbackParcelGeometry(
      await propertyDbRpc("api_get_parcel", {
        parcel_id: normalized.replace(/^ext-/, ""),
      }),
    );
    if (fromParcel) return fromParcel;
  }

  return null;
}

async function resolveGeometryFromCandidateSearch(
  inputParcelId: string,
  request: Request,
): Promise<ParcelGeometry | null> {
  const candidateParcelIds = new Set<string>(normalizeCandidateKey(inputParcelId));

  const matchedParcels = await propertyDbRpc("api_search_parcels", {
    search_text: inputParcelId,
    limit_rows: 10,
  });
  if (Array.isArray(matchedParcels)) {
    for (const row of matchedParcels) {
      if (!row || typeof row !== "object") continue;
      const record = row as Record<string, unknown>;
      for (const key of candidateParcelKeys(record)) {
        normalizeCandidateKey(key).forEach((value) => candidateParcelIds.add(value));
      }
      addAddressFallback(candidateParcelIds, record, inputParcelId);
    }
  }

  const alternateSearch = await propertyDbRpc("api_search_parcels", {
    p_search_text: inputParcelId,
    p_limit: 10,
  });
  if (Array.isArray(alternateSearch)) {
    for (const row of alternateSearch) {
      if (!row || typeof row !== "object") continue;
      const record = row as Record<string, unknown>;
      for (const key of candidateParcelKeys(record)) {
        normalizeCandidateKey(key).forEach((value) => candidateParcelIds.add(value));
      }
      addAddressFallback(candidateParcelIds, record, inputParcelId);
    }
  }

  for (const candidateId of candidateParcelIds) {
    if (request.signal.aborted) {
      throw new Error("Client aborted request");
    }
    try {
      const geometryFallback = await resolveGeometryFallback(candidateId);
      if (geometryFallback) return geometryFallback;
    } catch {
      // continue through candidates
    }
  }

  return null;
}

function deriveFallbackParcelGeometry(raw: unknown): ParcelGeometry | null {
  const row = (() => {
    if (Array.isArray(raw)) {
      return toRecord(raw[0]);
    }
    const rows = normalizeRpcRows(raw);
    return rows[0] ? rows[0] : null;
  })();
  if (!row) return null;

  const geometry =
    parseGeometry(row.geom_simplified) ??
    parseGeometry(row.geometry) ??
    parseGeometry(row.geom) ??
    parseGeometry(row.geom_geojson) ??
    parseGeometry(row.polygon) ??
    parseGeometry(row.geometry_geojson) ??
    parseGeometry(row.geom_geo_json) ??
    parseGeometry(row.wkb);
  if (!geometry) return null;

  const bbox = parseBbox(row.bbox) ?? bboxFromGeometry(geometry);
  if (!bbox) return null;

  let centroidLat = toFiniteNumber(toRecord(row.centroid)?.lat);
  let centroidLng = toFiniteNumber(toRecord(row.centroid)?.lng);
  if (centroidLat == null || centroidLng == null) {
    const centroidArray = Array.isArray(row.centroid) ? row.centroid : null;
    const arrLng = centroidArray ? toFiniteNumber(centroidArray[0]) : null;
    const arrLat = centroidArray ? toFiniteNumber(centroidArray[1]) : null;
    centroidLng = arrLng ?? (bbox[0] + bbox[2]) / 2;
    centroidLat = arrLat ?? (bbox[1] + bbox[3]) / 2;
  }

  const areaSqft =
    toFiniteNumber(row.area_sqft) ??
    toFiniteNumber(row.areaSqft) ??
    toFiniteNumber(row.area) ??
    0;

  const srid = toFiniteNumber(row.srid) ?? 4326;
  const datasetVersion =
    typeof row.dataset_version === "string" && row.dataset_version.length > 0
      ? row.dataset_version
      : "property_db_fallback";

  return {
    bbox,
    centroid: { lat: centroidLat, lng: centroidLng },
    area_sqft: areaSqft,
    geom_simplified: JSON.stringify(geometry),
    srid,
    dataset_version: datasetVersion,
  };
}

function deriveDevFallbackGeometry(parcelId: string): ParcelGeometry | null {
  if (!isDevParcelFallbackEnabled()) return null;
  const parcel = getDevFallbackParcelByPropertyDbId(parcelId);
  if (!parcel) return null;

  const areaSqft = Math.max(parcel.acreage * 43_560, 1_000);
  const halfSideFeet = Math.sqrt(areaSqft) / 2;
  const latScaleFeetPerDeg = 364_000;
  const lngScaleFeetPerDeg =
    Math.max(Math.cos((parcel.lat * Math.PI) / 180), 0.1) * latScaleFeetPerDeg;
  const latHalfDelta = halfSideFeet / latScaleFeetPerDeg;
  const lngHalfDelta = halfSideFeet / lngScaleFeetPerDeg;

  const ring = [
    [parcel.lng - lngHalfDelta, parcel.lat - latHalfDelta],
    [parcel.lng + lngHalfDelta, parcel.lat - latHalfDelta],
    [parcel.lng + lngHalfDelta, parcel.lat + latHalfDelta],
    [parcel.lng - lngHalfDelta, parcel.lat + latHalfDelta],
    [parcel.lng - lngHalfDelta, parcel.lat - latHalfDelta],
  ];
  const bbox: [number, number, number, number] = [
    parcel.lng - lngHalfDelta,
    parcel.lat - latHalfDelta,
    parcel.lng + lngHalfDelta,
    parcel.lat + latHalfDelta,
  ];

  return {
    bbox,
    centroid: { lat: parcel.lat, lng: parcel.lng },
    area_sqft: areaSqft,
    geom_simplified: JSON.stringify({
      type: "Polygon",
      coordinates: [ring],
    }),
    srid: 4326,
    dataset_version: "dev-fallback",
  };
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    if (request.signal.aborted) {
      return NextResponse.json(
        {
          ok: false,
          error: { code: "CLIENT_ABORTED", message: "Request aborted by client" },
        },
        { status: 499 },
      );
    }

    const isProd = process.env.NODE_ENV === "production";
    const devFallbackMode = isDevParcelFallbackEnabled();

    const auth = await resolveAuth();
    if (!auth) {
      return NextResponse.json(
        { ok: false, request_id: requestId, error: { code: "UNAUTHORIZED", message: "Unauthorized" } },
        { status: 401 },
      );
    }

    if (!devFallbackMode && !checkRateLimit(`${ROUTE_KEY}:${auth.orgId}`)) {
      return NextResponse.json(
        { ok: false, request_id: requestId, error: { code: "RATE_LIMITED", message: "Too many requests" } },
        { status: 429 },
      );
    }

    const contentLength = request.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_JSON_BODY_BYTES) {
      return NextResponse.json(
        { ok: false, request_id: requestId, error: { code: "PAYLOAD_TOO_LARGE", message: "Request body too large" } },
        { status: 413 },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { ok: false, request_id: requestId, error: { code: "BAD_REQUEST", message: "Invalid JSON body" } },
        { status: 400 },
      );
    }

    let input: z.infer<typeof BodySchema>;
    try {
      input = BodySchema.parse(body);
    } catch (err) {
      const message = err instanceof ZodError
        ? err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
        : "Invalid input";
      return NextResponse.json(
        { ok: false, request_id: requestId, error: { code: "BAD_REQUEST", message } },
        { status: 400 },
      );
    }

    logParcelGeometryDevPayload("request", {
      requestId,
      parcelId: input.parcelId,
      detailLevel: input.detailLevel,
    });

    const devGeometry = deriveDevFallbackGeometry(input.parcelId);
    if (devGeometry) {
      logParcelGeometryDevPayload("response", {
        requestId,
        parcelId: input.parcelId,
        source: "dev-fallback",
        hasGeom: Boolean(parseGeometry(devGeometry.geom_simplified)),
      });
      return NextResponse.json({ ok: true, request_id: requestId, data: devGeometry });
    }

    const propertyDbConfig = getPropertyDbConfigOrNull();
    if (!propertyDbConfig) {
      Sentry.withScope((scope) => {
        scope.setTags({ integration: "parcel-geometry", route: "/api/external/chatgpt-apps/parcel-geometry" });
        scope.setContext("parcel_geometry", {
          request_id: requestId,
          parcel_id: input.parcelId,
          details: "SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY missing or placeholder",
        });
        Sentry.captureException(new Error("Parcel geometry: property DB not configured"));
      });
      return NextResponse.json(
        {
          ok: false,
          request_id: requestId,
          error: {
            code: "PROPERTY_DB_UNCONFIGURED",
            message: "Parcel geometry provider is unavailable",
          },
          ...(!isProd
            ? {
              debug: {
                parcel_id: input.parcelId,
                details: "SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY missing or placeholder",
              },
            }
            : {}),
        },
        { status: 503 },
      );
    }

    try {
      const geometryFallback = await resolveGeometryFromCandidateSearch(
        input.parcelId,
        request,
      );
      if (geometryFallback) {
        logParcelGeometryDevPayload("response", {
          requestId,
          parcelId: input.parcelId,
          source: "supabase",
          hasGeom: Boolean(parseGeometry(geometryFallback.geom_simplified)),
        });
        return NextResponse.json({
          ok: true,
          request_id: requestId,
          data: geometryFallback,
        });
      }
    } catch (error) {
      if (isAbortLikeError(error) || request.signal.aborted) {
        return NextResponse.json(
          {
            ok: false,
            request_id: requestId,
            error: { code: "CLIENT_ABORTED", message: "Request aborted by client" },
          },
          { status: 499 },
        );
      }
      Sentry.withScope((scope) => {
        scope.setTags({ integration: "parcel-geometry", route: "/api/external/chatgpt-apps/parcel-geometry" });
        scope.setContext("parcel_geometry", {
          request_id: requestId,
          parcel_id: input.parcelId,
          error: error instanceof Error ? error.message : String(error),
        });
        Sentry.captureException(error instanceof Error ? error : new Error(String(error)));
      });
    }

    return NextResponse.json(
      {
        ok: false,
        request_id: requestId,
        error: {
          code: "NOT_FOUND",
          message: "Parcel geometry not found",
        },
        ...(!isProd ? { debug: { parcel_id: input.parcelId } } : {}),
      },
      { status: 404 },
    );
  } catch (error) {
    if (isAbortLikeError(error) || request.signal.aborted) {
      return NextResponse.json(
        {
          ok: false,
          request_id: requestId,
          error: { code: "CLIENT_ABORTED", message: "Request aborted by client" },
        },
        { status: 499 },
      );
    }
    console.error("[/api/external/chatgpt-apps/parcel-geometry]", error);
    return NextResponse.json(
      {
        ok: false,
        request_id: requestId,
        error: { code: "UPSTREAM_ERROR", message: "Internal server error" },
      },
      { status: 502 },
    );
  }
}
