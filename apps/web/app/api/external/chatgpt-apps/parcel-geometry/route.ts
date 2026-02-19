import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { getParcelGeometry, type ParcelGeometry } from "@/lib/server/chatgptAppsClient";
import { checkRateLimit } from "@/lib/server/rateLimiter";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { captureChatGptAppsError } from "@/lib/automation/sentry";
import { propertyDbRpc } from "@entitlement-os/openai";

export const runtime = "nodejs";

const ROUTE_KEY = "chatgpt-apps:parcel-geometry";
const MAX_JSON_BODY_BYTES = 20_000;

const BodySchema = z.object({
  parcelId: z.string().min(1),
  detailLevel: z.enum(["low", "medium", "high"]).default("low"),
});

type GeoJsonGeometry = {
  type: "Polygon" | "MultiPolygon";
  coordinates: unknown;
};

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
  if (type !== "Polygon" && type !== "MultiPolygon") return null;
  if (!Array.isArray(record.coordinates)) return null;
  return { type, coordinates: record.coordinates };
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
    if (trimmed.length > 0) {
      candidates.add(trimmed);
    }
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
  if (address.length > 0) {
    candidates.add(address);
  }
  const fallbackAddress = input.trim();
  if (fallbackAddress.length > 0) {
    candidates.add(fallbackAddress);
  }
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

    // Order required by map incident spec: direct geometry lookup first.
    const directGeometryRaw = await propertyDbRpc("api_get_parcel", {
      parcel_id: normalized,
    });
    const directGeometryRows = normalizeRpcRows(directGeometryRaw);
    const directGeometryFallback = deriveFallbackParcelGeometry(directGeometryRows);
    if (directGeometryFallback) return directGeometryFallback;

    // Address/normalized lookup second.
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

    // RPC fallback third.
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

    // Last compatibility attempt with the de-prefixed id.
    const fromParcel = deriveFallbackParcelGeometry(
      await propertyDbRpc("api_get_parcel", {
        parcel_id: normalized.replace(/^ext-/, ""),
      }),
    );
    if (fromParcel) return fromParcel;
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

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();

  const auth = await resolveAuth();
  if (!auth) {
    return NextResponse.json(
      { ok: false, request_id: requestId, error: { code: "UNAUTHORIZED", message: "Unauthorized" } },
      { status: 401 },
    );
  }

  if (!checkRateLimit(`${ROUTE_KEY}:${auth.orgId}`)) {
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

  let result: Awaited<ReturnType<typeof getParcelGeometry>>;
  try {
    result = await getParcelGeometry(input.parcelId, input.detailLevel, requestId);
  } catch {
    result = {
      ok: false,
      error: "Upstream request failed",
      status: 502,
      requestId,
      durationMs: 0,
    };
  }

  if (!result.ok) {
    try {
      const candidateParcelIds = new Set<string>(normalizeCandidateKey(input.parcelId));

      const matchedParcels = await propertyDbRpc("api_search_parcels", {
        search_text: input.parcelId,
        limit_rows: 10,
      });
      if (Array.isArray(matchedParcels)) {
        for (const row of matchedParcels) {
          if (!row || typeof row !== "object") continue;
          const record = row as Record<string, unknown>;
          for (const key of candidateParcelKeys(record)) {
            normalizeCandidateKey(key).forEach((value) => candidateParcelIds.add(value));
          }
          addAddressFallback(candidateParcelIds, record, input.parcelId);
        }
      }

      const alternateSearch = await propertyDbRpc("api_search_parcels", {
        p_search_text: input.parcelId,
        p_limit: 10,
      });
      if (Array.isArray(alternateSearch)) {
        for (const row of alternateSearch) {
          if (!row || typeof row !== "object") continue;
          const record = row as Record<string, unknown>;
          for (const key of candidateParcelKeys(record)) {
            normalizeCandidateKey(key).forEach((value) => candidateParcelIds.add(value));
          }
          addAddressFallback(candidateParcelIds, record, input.parcelId);
        }
      }

      for (const candidateId of candidateParcelIds) {
        try {
          const geometryFallback = await resolveGeometryFallback(candidateId);
          if (geometryFallback) {
            return NextResponse.json({
              ok: true,
              request_id: requestId,
              data: geometryFallback,
            });
          }
        } catch {
          // continue through candidates
        }
      }

    } catch {
      // continue to error response
    }

    captureChatGptAppsError(new Error(result.error), {
      rpc: "getParcelGeometry",
      requestId: result.requestId,
      orgId: auth.orgId,
      route: "/api/external/chatgpt-apps/parcel-geometry",
      status: result.status,
      input: { parcelId: input.parcelId, detailLevel: input.detailLevel },
      details: result.error,
    });
    const status = result.status === 429 ? 429 : result.status === 504 ? 504 : 502;
    return NextResponse.json(
      { ok: false, request_id: result.requestId, error: { code: "UPSTREAM_ERROR", message: result.error } },
      { status },
    );
  }

  return NextResponse.json({ ok: true, request_id: result.requestId, data: result.data });
}
