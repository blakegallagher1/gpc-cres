import { NextRequest, NextResponse } from "next/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";

/**
 * POST /api/map/isochrone
 * Body: { lat: number, lng: number, minutes: number }
 *
 * Generates a drive-time isochrone polygon using OSRM.
 * Uses a 16-ray approach: sends routing requests in 16 directions,
 * then connects the endpoints to form an approximate polygon.
 */
export async function POST(req: NextRequest) {
  const auth = await resolveAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { lat, lng, minutes } = body;

  if (!lat || !lng || !minutes) {
    return NextResponse.json(
      { error: "lat, lng, and minutes are required" },
      { status: 400 }
    );
  }

  try {
    const polygon = await computeIsochrone(
      Number(lat),
      Number(lng),
      Number(minutes)
    );
    return NextResponse.json({ polygon });
  } catch (error) {
    console.error("Isochrone error:", error);
    return NextResponse.json(
      { error: "Failed to compute isochrone" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// OSRM 16-ray isochrone approximation
// ---------------------------------------------------------------------------

const NUM_RAYS = 16;
const OSRM_BASE = "https://router.project-osrm.org";

/**
 * For each of 16 directions, find a destination point at roughly `minutes`
 * of driving distance using OSRM routing. Binary search along each ray
 * to find the max reachable point within the time budget.
 */
async function computeIsochrone(
  centerLat: number,
  centerLng: number,
  minutes: number
): Promise<[number, number][]> {
  const maxDriveSec = minutes * 60;

  // Start with an initial guess for max distance based on ~50 mph avg
  const maxDistKm = (minutes / 60) * 80; // 80 km/h = ~50 mph

  const angles = Array.from(
    { length: NUM_RAYS },
    (_, i) => (i * 360) / NUM_RAYS
  );

  // For each direction, find the furthest reachable point
  const endpoints = await Promise.all(
    angles.map(async (angle) => {
      return findReachablePoint(
        centerLat,
        centerLng,
        angle,
        maxDriveSec,
        maxDistKm
      );
    })
  );

  // Close the polygon
  const polygon: [number, number][] = endpoints.map((p) => [p.lat, p.lng]);
  polygon.push(polygon[0]);

  return polygon;
}

/**
 * Binary search along a bearing to find the max distance reachable
 * within the time budget.
 */
async function findReachablePoint(
  lat: number,
  lng: number,
  bearingDeg: number,
  maxTimeSec: number,
  maxDistKm: number
): Promise<{ lat: number; lng: number }> {
  let lo = 0;
  let hi = maxDistKm;
  let bestPoint = { lat, lng };
  const MAX_ITERATIONS = 4; // Keep OSRM calls reasonable

  for (let i = 0; i < MAX_ITERATIONS; i++) {
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
      // If OSRM fails, shrink the search
      hi = mid;
    }
  }

  return bestPoint;
}

/**
 * Query OSRM for route duration between two points.
 */
async function getRouteDuration(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): Promise<number> {
  const url = `${OSRM_BASE}/route/v1/driving/${lng1},${lat1};${lng2},${lat2}?overview=false`;
  const res = await fetch(url, {
    headers: { "User-Agent": "EntitlementOS/1.0" },
  });

  if (!res.ok) throw new Error(`OSRM error: ${res.status}`);
  const data = await res.json();

  if (data.code !== "Ok" || !data.routes?.[0]) {
    throw new Error("No route found");
  }

  return data.routes[0].duration; // seconds
}

/**
 * Calculate destination point given start, bearing, and distance.
 * Uses the Haversine formula inverse.
 */
function destinationPoint(
  lat: number,
  lng: number,
  bearingDeg: number,
  distKm: number
): { lat: number; lng: number } {
  const R = 6371; // Earth radius in km
  const d = distKm / R;
  const brng = (bearingDeg * Math.PI) / 180;
  const lat1 = (lat * Math.PI) / 180;
  const lng1 = (lng * Math.PI) / 180;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng)
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
    );

  return {
    lat: (lat2 * 180) / Math.PI,
    lng: (lng2 * 180) / Math.PI,
  };
}
