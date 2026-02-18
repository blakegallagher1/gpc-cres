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

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
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

function deriveFallbackParcelGeometry(raw: unknown): ParcelGeometry | null {
  const row = Array.isArray(raw) ? toRecord(raw[0]) : toRecord(raw);
  if (!row) return null;

  const geometry =
    parseGeometry(row.geom_simplified) ??
    parseGeometry(row.geometry) ??
    parseGeometry(row.geom) ??
    parseGeometry(row.geom_geojson) ??
    parseGeometry(row.polygon);
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
      const candidateParcelIds = new Set<string>();
      candidateParcelIds.add(input.parcelId);

      if (!isUuid(input.parcelId)) {
        const matchedParcels = await propertyDbRpc("api_search_parcels", {
          search_text: input.parcelId,
          limit_rows: 1,
        });
        const firstMatch =
          Array.isArray(matchedParcels) &&
          matchedParcels[0] &&
          typeof matchedParcels[0] === "object"
            ? (matchedParcels[0] as Record<string, unknown>)
            : null;
        if (firstMatch && typeof firstMatch.id === "string" && firstMatch.id.length > 0) {
          candidateParcelIds.add(firstMatch.id);
        }
      }

      for (const candidateId of candidateParcelIds) {
        if (!isUuid(candidateId)) continue;

        const geometryRpcRaw = await propertyDbRpc("rpc_get_parcel_geometry", {
          parcel_id: candidateId,
        });
        const geometryFallback = deriveFallbackParcelGeometry(geometryRpcRaw);
        if (geometryFallback) {
          return NextResponse.json({
            ok: true,
            request_id: requestId,
            data: geometryFallback,
          });
        }

        const parcelRpcRaw = await propertyDbRpc("api_get_parcel", {
          parcel_id: candidateId,
        });
        const parcelFallback = deriveFallbackParcelGeometry(parcelRpcRaw);
        if (parcelFallback) {
          return NextResponse.json({
            ok: true,
            request_id: requestId,
            data: parcelFallback,
          });
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
