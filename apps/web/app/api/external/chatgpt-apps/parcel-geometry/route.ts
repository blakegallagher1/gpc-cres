import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import * as Sentry from "@sentry/nextjs";
import { checkRateLimit } from "@/lib/server/rateLimiter";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import {
  getDevFallbackParcelByPropertyDbId,
  isDevParcelFallbackEnabled,
} from "@/lib/server/devParcelFallback";

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

function mapGatewayRowToGeometry(row: Record<string, unknown>): ParcelGeometry | null {
  const geometry =
    parseGeometry(row.geom_simplified) ??
    parseGeometry(row.geometry) ??
    parseGeometry(row.geom);
  if (!geometry) return null;

  const bbox = parseBbox(row.bbox) ?? bboxFromGeometry(geometry);
  if (!bbox) return null;

  let centroidLat = toFiniteNumber(toRecord(row.centroid)?.lat);
  let centroidLng = toFiniteNumber(toRecord(row.centroid)?.lng);
  if (centroidLat == null || centroidLng == null) {
    centroidLng = (bbox[0] + bbox[2]) / 2;
    centroidLat = (bbox[1] + bbox[3]) / 2;
  }

  return {
    bbox,
    centroid: { lat: centroidLat, lng: centroidLng },
    area_sqft: toFiniteNumber(row.area_sqft) ?? 0,
    geom_simplified: JSON.stringify(geometry),
    srid: toFiniteNumber(row.srid) ?? 4326,
    dataset_version:
      typeof row.dataset_version === "string" && row.dataset_version.length > 0
        ? row.dataset_version
        : "gateway",
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
    geom_simplified: JSON.stringify({ type: "Polygon", coordinates: [ring] }),
    srid: 4326,
    dataset_version: "dev-fallback",
  };
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    if (request.signal.aborted) {
      return NextResponse.json(
        { ok: false, error: { code: "CLIENT_ABORTED", message: "Request aborted by client" } },
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
      const message =
        err instanceof ZodError
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

    // Dev fallback: synthetic bounding box from seed data (no gateway needed)
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

    const gatewayUrl = process.env.LOCAL_API_URL?.trim();
    const gatewayKey = process.env.LOCAL_API_KEY?.trim();
    if (!gatewayUrl || !gatewayKey) {
      Sentry.withScope((scope) => {
        scope.setTags({ integration: "parcel-geometry", route: "/api/external/chatgpt-apps/parcel-geometry" });
        scope.setContext("parcel_geometry", {
          request_id: requestId,
          parcel_id: input.parcelId,
          details: "LOCAL_API_URL/LOCAL_API_KEY missing",
        });
        Sentry.captureException(new Error("Parcel geometry: gateway not configured"));
      });
      return NextResponse.json(
        {
          ok: false,
          request_id: requestId,
          error: {
            code: "GATEWAY_UNCONFIGURED",
            message: "Parcel geometry provider is unavailable",
          },
          ...(!isProd
            ? { debug: { parcel_id: input.parcelId, details: "LOCAL_API_URL/LOCAL_API_KEY missing" } }
            : {}),
        },
        { status: 503 },
      );
    }

    try {
      const parcelId = input.parcelId.replace(/^ext-/, "").trim();
      const url = `${gatewayUrl}/api/parcels/${encodeURIComponent(parcelId)}/geometry?detail_level=${input.detailLevel}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${gatewayKey}` },
        signal: request.signal,
      });

      if (res.status === 404) {
        return NextResponse.json(
          {
            ok: false,
            request_id: requestId,
            error: { code: "NOT_FOUND", message: "Parcel geometry not found" },
            ...(!isProd ? { debug: { parcel_id: input.parcelId } } : {}),
          },
          { status: 404 },
        );
      }

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        console.warn("[/api/external/chatgpt-apps/parcel-geometry] gateway error", {
          status: res.status,
          parcelId: input.parcelId,
          body: errText.slice(0, 200),
        });
        throw new Error(`Gateway responded with ${res.status}`);
      }

      const json = (await res.json()) as { ok: boolean; data?: Record<string, unknown> };
      const row = json.data;
      if (!row) throw new Error("Gateway returned no data");

      const geometry = mapGatewayRowToGeometry(row);
      if (!geometry) {
        return NextResponse.json(
          {
            ok: false,
            request_id: requestId,
            error: { code: "NOT_FOUND", message: "Parcel geometry not found" },
            ...(!isProd ? { debug: { parcel_id: input.parcelId } } : {}),
          },
          { status: 404 },
        );
      }

      logParcelGeometryDevPayload("response", {
        requestId,
        parcelId: input.parcelId,
        source: "gateway",
        hasGeom: true,
      });
      return NextResponse.json({ ok: true, request_id: requestId, data: geometry });
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
        error: { code: "NOT_FOUND", message: "Parcel geometry not found" },
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
