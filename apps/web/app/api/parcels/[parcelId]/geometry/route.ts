import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { checkRateLimit } from "@/lib/server/rateLimiter";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import {
  getCloudflareAccessHeadersFromEnv,
  logPropertyDbRuntimeHealth,
} from "@/lib/server/propertyDbEnv";

export const runtime = "nodejs";

const ROUTE_KEY = "parcel-geometry";

class ParcelGeometryGatewayError extends Error {
  status: number;
  code: "GATEWAY_UNCONFIGURED" | "GATEWAY_UNAVAILABLE";

  constructor(
    message: string,
    code: "GATEWAY_UNCONFIGURED" | "GATEWAY_UNAVAILABLE",
    status: number = 503,
  ) {
    super(message);
    this.name = "ParcelGeometryGatewayError";
    this.status = status;
    this.code = code;
  }
}

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
  if (type === "Feature") return parseGeometry(record.geometry);
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
  for (const next of value) collectCoordinatePairs(next, pairs);
}

function bboxFromGeometry(geometry: GeoJsonGeometry): [number, number, number, number] | null {
  const pairs: Array<[number, number]> = [];
  collectCoordinatePairs(geometry.coordinates, pairs);
  if (pairs.length === 0) return null;
  let minLng = Number.POSITIVE_INFINITY, minLat = Number.POSITIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY, maxLat = Number.NEGATIVE_INFINITY;
  for (const [lng, lat] of pairs) {
    minLng = Math.min(minLng, lng); minLat = Math.min(minLat, lat);
    maxLng = Math.max(maxLng, lng); maxLat = Math.max(maxLat, lat);
  }
  return [minLng, minLat, maxLng, maxLat];
}

function parseBbox(value: unknown): [number, number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 4) return null;
  const [a, b, c, d] = value.map(toFiniteNumber);
  if (a == null || b == null || c == null || d == null) return null;
  return [a, b, c, d];
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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ parcelId: string }> },
) {
  const requestId = crypto.randomUUID();
  try {
    const auth = await resolveAuth(request);
    if (!auth) {
      return NextResponse.json(
        { ok: false, request_id: requestId, error: { code: "UNAUTHORIZED", message: "Unauthorized" } },
        { status: 401 },
      );
    }

    const { parcelId: rawParcelId } = await params;
    const parcelId = decodeURIComponent(rawParcelId).replace(/^ext-/, "").trim();

    if (!parcelId) {
      return NextResponse.json(
        { ok: false, request_id: requestId, error: { code: "BAD_REQUEST", message: "parcelId is required" } },
        { status: 400 },
      );
    }

    const { searchParams } = new URL(request.url);
    const detailLevel = (searchParams.get("detail_level") ?? "low") as "low" | "medium" | "high";

    if (!checkRateLimit(`${ROUTE_KEY}:${auth.orgId}`, 50, 10)) {
      return NextResponse.json(
        { ok: false, request_id: requestId, error: { code: "RATE_LIMITED", message: "Too many requests" } },
        { status: 429 },
      );
    }

    const gatewayConfig = logPropertyDbRuntimeHealth("/api/parcels/[parcelId]/geometry");
    if (!gatewayConfig) {
      throw new ParcelGeometryGatewayError(
        "Parcel geometry gateway is not configured",
        "GATEWAY_UNCONFIGURED",
        503,
      );
    }
    const gatewayUrl = gatewayConfig.url.replace(/\/$/, "");
    const gatewayKey = gatewayConfig.key;

    const GEOMETRY_TIMEOUT_MS = 8000;
    const url = `${gatewayUrl}/api/parcels/${encodeURIComponent(parcelId)}/geometry?detail_level=${detailLevel}`;
    let res: Response;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GEOMETRY_TIMEOUT_MS);
    try {
      res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${gatewayKey}`,
          ...getCloudflareAccessHeadersFromEnv(),
        },
        signal: controller.signal,
      });
    } catch (error) {
      const reason = error instanceof Error && error.name === "AbortError"
        ? `request timed out after ${GEOMETRY_TIMEOUT_MS}ms`
        : error instanceof Error ? error.message : String(error);
      throw new ParcelGeometryGatewayError(
        `[parcel-geometry] request failed: ${reason}`,
        "GATEWAY_UNAVAILABLE",
      );
    } finally {
      clearTimeout(timeout);
    }

    if (res.status === 404) {
      return NextResponse.json(
        { ok: false, request_id: requestId, error: { code: "NOT_FOUND", message: "Parcel geometry not found" } },
        { status: 404 },
      );
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      const status = res.status >= 500 ? 502 : 503;
      throw new ParcelGeometryGatewayError(
        `[parcel-geometry] gateway responded with ${res.status}: ${errText.slice(0, 300)}`,
        "GATEWAY_UNAVAILABLE",
        status,
      );
    }

    let json: { ok: boolean; data?: Record<string, unknown> };
    try {
      json = (await res.json()) as { ok: boolean; data?: Record<string, unknown> };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new ParcelGeometryGatewayError(
        `[parcel-geometry] invalid JSON response: ${reason}`,
        "GATEWAY_UNAVAILABLE",
      );
    }
    const row = json.data;
    if (!row) {
      throw new ParcelGeometryGatewayError(
        "[parcel-geometry] gateway returned no data",
        "GATEWAY_UNAVAILABLE",
      );
    }

    const geometry = mapGatewayRowToGeometry(row);
    if (!geometry) {
      return NextResponse.json(
        { ok: false, request_id: requestId, error: { code: "NOT_FOUND", message: "Parcel geometry not found" } },
        { status: 404 },
      );
    }

    const response = NextResponse.json({ ok: true, request_id: requestId, data: geometry });
    // Geometry is stable — cache aggressively (5 min fresh, serve stale up to 1 hour)
    response.headers.set("Cache-Control", "private, max-age=300, stale-while-revalidate=3600");
    return response;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    Sentry.captureException(err, {
      tags: { route: "/api/parcels/[parcelId]/geometry" },
    });
    if (error instanceof ParcelGeometryGatewayError) {
      const message =
        error.code === "GATEWAY_UNCONFIGURED"
          ? "Parcel geometry provider is unavailable"
          : "Parcel geometry gateway error";
      return NextResponse.json(
        {
          ok: false,
          request_id: requestId,
          error: { code: error.code, message },
        },
        { status: error.status ?? 503 },
      );
    }
    return NextResponse.json(
      { ok: false, request_id: requestId, error: { code: "UPSTREAM_ERROR", message: "Internal server error" } },
      { status: 502 },
    );
  }
}
