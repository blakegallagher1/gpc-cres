import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import * as Sentry from "@sentry/nextjs";
import {
  computeIsochrone as computeMapboxIsochrone,
  IsochroneConfigError,
  IsochroneUpstreamError,
} from "@gpc/server/services/isochrone.service";

const LegacyIsochroneRequestSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  minutes: z.coerce.number().int().min(1).max(60),
});

const MultiBandIsochroneRequestSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  minutes: z.array(z.coerce.number().int().min(1).max(60)).min(1).max(4),
});

/**
 * POST /api/map/isochrone
 *
 * Dual-mode endpoint:
 *
 *  1. **Legacy single-band (OSRM fallback)**
 *     Body: `{ lat, lng, minutes: number }`
 *     Returns: `{ polygon: [[lat,lng], ...] }` — a 12-ray OSRM polygon suitable
 *     for the existing MapLibre drive-time toggle. No external token needed.
 *
 *  2. **Multi-band (Mapbox Isochrone API)**
 *     Body: `{ lat, lng, minutes: number[] }` (1..4 bands, each 1..60 min)
 *     Returns: a GeoJSON FeatureCollection from the Mapbox Isochrone API.
 *     Gated by `MAPBOX_ACCESS_TOKEN`; returns 503 when unset.
 */
export async function POST(req: NextRequest) {
  const auth = await resolveAuth(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!auth.orgId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Validation failed", details: { body: ["Invalid JSON body"] } },
      { status: 400 },
    );
  }

  const asRecord = (body ?? {}) as Record<string, unknown>;
  const multiBand = Array.isArray(asRecord.minutes);

  if (multiBand) {
    let input: z.infer<typeof MultiBandIsochroneRequestSchema>;
    try {
      input = MultiBandIsochroneRequestSchema.parse(body);
    } catch (err) {
      Sentry.captureException(err, {
        tags: { route: "api.map.isochrone", method: "POST", mode: "multi" },
      });
      if (err instanceof ZodError) {
        return NextResponse.json(
          { error: "Validation failed", details: err.flatten().fieldErrors },
          { status: 400 },
        );
      }
      return NextResponse.json({ error: "Validation failed" }, { status: 400 });
    }

    try {
      const featureCollection = await computeMapboxIsochrone({
        lat: input.lat,
        lng: input.lng,
        minutes: input.minutes,
      });
      return NextResponse.json(featureCollection);
    } catch (err) {
      if (err instanceof IsochroneConfigError) {
        return NextResponse.json(
          { error: "Isochrone service not configured", details: { reason: err.message } },
          { status: 503 },
        );
      }
      if (err instanceof IsochroneUpstreamError) {
        Sentry.captureException(err, {
          tags: { route: "api.map.isochrone", method: "POST", mode: "multi" },
        });
        return NextResponse.json(
          { error: "Upstream isochrone failure", details: { status: err.status } },
          { status: err.status >= 500 && err.status <= 599 ? err.status : 502 },
        );
      }
      Sentry.captureException(err, {
        tags: { route: "api.map.isochrone", method: "POST", mode: "multi" },
      });
      return NextResponse.json(
        { error: "Failed to compute isochrone" },
        { status: 500 },
      );
    }
  }

  // Legacy single-band path (OSRM polygon ray casting)
  let legacy: z.infer<typeof LegacyIsochroneRequestSchema>;
  try {
    legacy = LegacyIsochroneRequestSchema.parse(body);
  } catch (err) {
    Sentry.captureException(err, {
      tags: { route: "api.map.isochrone", method: "POST", mode: "legacy" },
    });
    if (err instanceof ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: err.flatten().fieldErrors },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  try {
    const polygon = await computeOsrmIsochrone(legacy.lat, legacy.lng, legacy.minutes);
    return NextResponse.json({ polygon });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.map.isochrone", method: "POST", mode: "legacy" },
    });
    console.error("[map-isochrone-route]", error);
    return NextResponse.json(
      { error: "Failed to compute isochrone" },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// OSRM 12-ray isochrone approximation (legacy single-band path)
// ---------------------------------------------------------------------------

const NUM_RAYS = 12;
const OSRM_BASE = "https://router.project-osrm.org";
const OSRM_TIMEOUT_MS = 2500;
const ISOCHRONE_DEADLINE_MS = 9000;

async function computeOsrmIsochrone(
  centerLat: number,
  centerLng: number,
  minutes: number,
): Promise<[number, number][]> {
  const deadline = Date.now() + ISOCHRONE_DEADLINE_MS;
  const maxDriveSec = minutes * 60;
  const maxDistKm = (minutes / 60) * 80;

  const angles = Array.from({ length: NUM_RAYS }, (_, i) => (i * 360) / NUM_RAYS);

  const endpoints = await Promise.all(
    angles.map(async (angle) =>
      findReachablePoint(centerLat, centerLng, angle, maxDriveSec, maxDistKm, deadline),
    ),
  );

  const unique = new Set(
    endpoints.map((p) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`),
  );
  if (unique.size < 4) {
    const radiusKm = Math.max((minutes / 60) * 45, 0.8);
    const fallback = angles.map((angle) =>
      destinationPoint(centerLat, centerLng, angle, radiusKm),
    );
    const polygon: [number, number][] = fallback.map((p) => [p.lat, p.lng]);
    polygon.push(polygon[0]);
    return polygon;
  }

  const polygon: [number, number][] = endpoints.map((p) => [p.lat, p.lng]);
  polygon.push(polygon[0]);
  return polygon;
}

async function findReachablePoint(
  lat: number,
  lng: number,
  bearingDeg: number,
  maxTimeSec: number,
  maxDistKm: number,
  deadlineEpochMs: number,
): Promise<{ lat: number; lng: number }> {
  let lo = 0;
  let hi = maxDistKm;
  let bestPoint = { lat, lng };
  const MAX_ITERATIONS = 3;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    if (Date.now() >= deadlineEpochMs) break;
    const mid = (lo + hi) / 2;
    const dest = destinationPoint(lat, lng, bearingDeg, mid);
    try {
      const duration = await getRouteDuration(lat, lng, dest.lat, dest.lng);
      if (duration <= maxTimeSec) {
        bestPoint = dest;
        lo = mid;
      } else {
        hi = mid;
      }
    } catch {
      hi = mid;
    }
  }

  return bestPoint;
}

async function getRouteDuration(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): Promise<number> {
  const url = `${OSRM_BASE}/route/v1/driving/${lng1},${lat1};${lng2},${lat2}?overview=false`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OSRM_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": "EntitlementOS/1.0" },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) throw new Error(`OSRM error: ${res.status}`);
  const data = await res.json();
  if (data.code !== "Ok" || !data.routes?.[0]) {
    throw new Error("No route found");
  }
  return data.routes[0].duration;
}

function destinationPoint(
  lat: number,
  lng: number,
  bearingDeg: number,
  distKm: number,
): { lat: number; lng: number } {
  const R = 6371;
  const d = distKm / R;
  const brng = (bearingDeg * Math.PI) / 180;
  const lat1 = (lat * Math.PI) / 180;
  const lng1 = (lng * Math.PI) / 180;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng),
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
    );

  return { lat: (lat2 * 180) / Math.PI, lng: (lng2 * 180) / Math.PI };
}
