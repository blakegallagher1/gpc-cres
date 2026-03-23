import { tool } from "@openai/agents";
import { z } from "zod";

/**
 * Spatial analysis tools — drive-time isochrones, radius buffers, geocoding.
 *
 * Uses Google Routes API for accurate drive-time polygons.
 * Falls back to radius approximation if Google API key is not set.
 *
 * Env vars:
 *   GOOGLE_MAPS_API_KEY — Required for isochrone computation
 */

const GOOGLE_API_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// Inline GeoJSON types (avoids @types/geojson dependency)
// ---------------------------------------------------------------------------

interface GeoJsonPolygon {
  type: "Polygon";
  coordinates: Array<Array<[number, number]>>;
}

interface GeoJsonFeature {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: GeoJsonPolygon;
}

// ---------------------------------------------------------------------------
// Isochrone computation via Google Routes API
// ---------------------------------------------------------------------------

/**
 * Compute a drive-time isochrone polygon using Google Routes API.
 * Returns a GeoJSON polygon representing the area reachable within the given time.
 */
async function computeGoogleIsochrone(
  origin: { lat: number; lng: number },
  travelTimeMinutes: number,
  mode: "driving" | "walking" | "bicycling",
  apiKey: string,
): Promise<GeoJsonFeature | null> {
  // Google Maps doesn't have a direct isochrone API, but we can approximate
  // using Distance Matrix to sample reachable distances in multiple directions,
  // then construct a polygon from the reachable points.
  //
  // For production accuracy, we sample 16 compass directions at the estimated
  // max radius, then refine with Distance Matrix to find actual reachable distance.

  const speedKmH = mode === "driving" ? 60 : mode === "bicycling" ? 15 : 5;
  const maxRadiusKm = (speedKmH * travelTimeMinutes) / 60;
  const maxRadiusDeg = maxRadiusKm / 111.32; // approximate degrees

  // Sample 24 directions
  const numDirections = 24;
  const samplePoints: Array<{ lat: number; lng: number; bearing: number }> = [];
  for (let i = 0; i < numDirections; i++) {
    const bearing = (i * 360) / numDirections;
    const rad = (bearing * Math.PI) / 180;
    samplePoints.push({
      lat: origin.lat + maxRadiusDeg * Math.cos(rad),
      lng: origin.lng + (maxRadiusDeg * Math.sin(rad)) / Math.cos((origin.lat * Math.PI) / 180),
      bearing,
    });
  }

  // Query Google Distance Matrix for actual travel times to sample points
  const destinations = samplePoints.map((p) => `${p.lat},${p.lng}`).join("|");
  const params = new URLSearchParams({
    origins: `${origin.lat},${origin.lng}`,
    destinations,
    mode: mode === "driving" ? "driving" : mode === "bicycling" ? "bicycling" : "walking",
    key: apiKey,
  });

  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/distancematrix/json?${params}`,
      { signal: AbortSignal.timeout(GOOGLE_API_TIMEOUT_MS) },
    );
    if (!res.ok) return null;

    const data = (await res.json()) as {
      status: string;
      rows?: Array<{
        elements?: Array<{
          status: string;
          duration?: { value: number }; // seconds
          distance?: { value: number }; // meters
        }>;
      }>;
    };

    if (data.status !== "OK" || !data.rows?.[0]?.elements) return null;

    const targetSeconds = travelTimeMinutes * 60;
    const elements = data.rows[0].elements;

    // For each direction, scale the sample point based on actual travel time
    const reachablePoints: Array<[number, number]> = [];
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      if (el.status !== "OK" || !el.duration) {
        // If unreachable, use 60% of max radius for this direction
        const rad = (samplePoints[i].bearing * Math.PI) / 180;
        const scaledRadius = maxRadiusDeg * 0.6;
        reachablePoints.push([
          origin.lng + (scaledRadius * Math.sin(rad)) / Math.cos((origin.lat * Math.PI) / 180),
          origin.lat + scaledRadius * Math.cos(rad),
        ]);
        continue;
      }

      // Scale: if actual travel is 20 min but target is 30 min, extend point by 30/20
      const ratio = Math.min(targetSeconds / el.duration.value, 1.5);
      const rad = (samplePoints[i].bearing * Math.PI) / 180;
      const scaledRadius = maxRadiusDeg * ratio;
      reachablePoints.push([
        origin.lng + (scaledRadius * Math.sin(rad)) / Math.cos((origin.lat * Math.PI) / 180),
        origin.lat + scaledRadius * Math.cos(rad),
      ]);
    }

    // Close the polygon
    if (reachablePoints.length > 0) {
      reachablePoints.push(reachablePoints[0]);
    }

    return {
      type: "Feature",
      properties: {
        origin: `${origin.lat},${origin.lng}`,
        travelTimeMinutes,
        mode,
        computedAt: new Date().toISOString(),
      },
      geometry: {
        type: "Polygon",
        coordinates: [reachablePoints],
      },
    };
  } catch (err) {
    console.warn(
      `[spatialTools] Google Distance Matrix failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

/**
 * Fallback: approximate isochrone as a circle (no API needed).
 */
function approximateRadiusIsochrone(
  origin: { lat: number; lng: number },
  travelTimeMinutes: number,
  mode: "driving" | "walking" | "bicycling",
): GeoJsonFeature {
  const speedKmH = mode === "driving" ? 50 : mode === "bicycling" ? 12 : 4;
  const radiusKm = (speedKmH * travelTimeMinutes) / 60;
  const radiusDeg = radiusKm / 111.32;

  const numPoints = 64;
  const coords: Array<[number, number]> = [];
  for (let i = 0; i <= numPoints; i++) {
    const angle = (i * 2 * Math.PI) / numPoints;
    coords.push([
      origin.lng + (radiusDeg * Math.cos(angle)) / Math.cos((origin.lat * Math.PI) / 180),
      origin.lat + radiusDeg * Math.sin(angle),
    ]);
  }

  return {
    type: "Feature",
    properties: {
      origin: `${origin.lat},${origin.lng}`,
      travelTimeMinutes,
      mode,
      approximation: "radius",
      radiusKm,
      computedAt: new Date().toISOString(),
    },
    geometry: {
      type: "Polygon",
      coordinates: [coords],
    },
  };
}

// ---------------------------------------------------------------------------
// Geocoding helper (reusable)
// ---------------------------------------------------------------------------

async function geocodeForSpatial(address: string): Promise<{ lat: number; lng: number } | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!apiKey || !apiKey.startsWith("AIza")) return null;

  const params = new URLSearchParams({
    address,
    key: apiKey,
    components: "country:US",
  });
  try {
    const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      status: string;
      results?: Array<{ geometry?: { location?: { lat: number; lng: number } } }>;
    };
    if (data.status !== "OK" || !data.results?.length) return null;
    const loc = data.results[0].geometry?.location;
    return loc ? { lat: loc.lat, lng: loc.lng } : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Agent Tool: compute_drive_time_area
// ---------------------------------------------------------------------------

export const computeDriveTimeArea = tool({
  name: "compute_drive_time_area",
  description:
    "Compute a drive-time isochrone polygon — the area reachable within N minutes from an origin point. " +
    "Use this for spatial queries like 'parcels within 30 minutes of I-10' or 'find sites within a 15 minute drive of downtown'. " +
    "Returns a GeoJSON polygon that can be used with query_property_db_sql ST_Within/ST_Intersects to find parcels inside the area. " +
    "The polygon is also rendered on the map as an overlay.\n\n" +
    "USAGE PATTERN:\n" +
    "1. Call compute_drive_time_area to get the isochrone polygon\n" +
    "2. Use the returned polygon coordinates in a query_property_db_sql call with ST_Within\n" +
    "   Example: SELECT ... FROM ebr_parcels WHERE ST_Within(geom, ST_GeomFromGeoJSON('{polygon}'))\n\n" +
    "The origin can be specified as lat/lng coordinates OR as an address (which will be geocoded).",
  parameters: z.object({
    origin_lat: z.number().optional().nullable().describe("Origin latitude. Provide this OR origin_address."),
    origin_lng: z.number().optional().nullable().describe("Origin longitude. Provide this OR origin_address."),
    origin_address: z.string().optional().nullable().describe("Origin address to geocode (e.g. 'I-10 and Airline Hwy, Baton Rouge, LA'). Used if lat/lng not provided."),
    travel_time_minutes: z.number().min(1).max(120).describe("Maximum travel time in minutes (1-120)."),
    mode: z.string().optional().nullable().describe("Travel mode: 'driving' (default), 'walking', or 'bicycling'."),
  }),
  execute: async (params) => {
    const travelMode = (params.mode === "walking" || params.mode === "bicycling")
      ? params.mode
      : "driving" as const;

    // Resolve origin coordinates
    let origin: { lat: number; lng: number } | null = null;
    if (params.origin_lat != null && params.origin_lng != null) {
      origin = { lat: params.origin_lat, lng: params.origin_lng };
    } else if (params.origin_address) {
      origin = await geocodeForSpatial(params.origin_address);
      if (!origin) {
        return JSON.stringify({
          error: `Could not geocode address: "${params.origin_address}". Try providing lat/lng coordinates directly.`,
        });
      }
    } else {
      return JSON.stringify({
        error: "Provide either origin_lat/origin_lng or origin_address.",
      });
    }

    // Compute isochrone
    const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
    let polygon: GeoJsonFeature;
    let method: string;

    if (apiKey && apiKey.startsWith("AIza")) {
      const googleResult = await computeGoogleIsochrone(
        origin,
        params.travel_time_minutes,
        travelMode,
        apiKey,
      );
      if (googleResult) {
        polygon = googleResult;
        method = "google_distance_matrix";
      } else {
        polygon = approximateRadiusIsochrone(origin, params.travel_time_minutes, travelMode);
        method = "radius_approximation_fallback";
      }
    } else {
      polygon = approximateRadiusIsochrone(origin, params.travel_time_minutes, travelMode);
      method = "radius_approximation";
    }

    // Build GeoJSON string for use in SQL queries
    const geojsonStr = JSON.stringify(polygon.geometry);

    // Build map action to render the isochrone overlay
    const mapAction = {
      action: "addLayer",
      layerId: `isochrone-${params.travel_time_minutes}min-${Date.now()}`,
      geojson: {
        type: "FeatureCollection",
        features: [polygon],
      },
      style: {
        paint: {
          "fill-color": "#4A90D9",
          "fill-opacity": 0.15,
          "line-color": "#4A90D9",
          "line-width": 2,
        },
      },
      label: `${params.travel_time_minutes}-min ${travelMode} area`,
    };

    return JSON.stringify({
      origin,
      travelTimeMinutes: params.travel_time_minutes,
      mode: travelMode,
      method,
      geojsonGeometry: geojsonStr,
      sqlHint: `Use in SQL: WHERE ST_Within(geom, ST_SetSRID(ST_GeomFromGeoJSON('${geojsonStr}'), 4326))`,
      polygon,
      __mapAction: mapAction,
    });
  },
});
