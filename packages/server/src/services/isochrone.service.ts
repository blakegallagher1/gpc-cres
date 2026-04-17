/**
 * Isochrone (drive-time) service.
 *
 * Wraps the Mapbox Isochrone API to compute drive-time polygons from a
 * parcel center point. Designed to power the "15 / 30 / 45 minute access"
 * analytical overlay for the light-industrial / truck-parking thesis where
 * last-mile accessibility to ports, rail, and interchanges drives deal
 * quality.
 *
 * Gated by the `MAPBOX_ACCESS_TOKEN` environment variable. When the token
 * is unset, `computeIsochrone` throws `IsochroneConfigError`; callers should
 * translate that to a 503 (not-configured) response so the UI can show a
 * clear "configure token to enable" state instead of silently failing.
 */

const MAPBOX_ISOCHRONE_ENDPOINT = "https://api.mapbox.com/isochrone/v1/mapbox/driving";
const MAPBOX_FETCH_TIMEOUT_MS = 10_000;

export interface ComputeIsochroneInput {
  lat: number;
  lng: number;
  /** One or more drive-time contours, in minutes. Mapbox allows max 4 values, each 1..60. */
  minutes: number[];
}

export class IsochroneConfigError extends Error {
  constructor(message = "MAPBOX_ACCESS_TOKEN is not configured") {
    super(message);
    this.name = "IsochroneConfigError";
  }
}

export class IsochroneUpstreamError extends Error {
  public readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "IsochroneUpstreamError";
    this.status = status;
  }
}

type IsochroneFeature = GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon, { contour?: number; [k: string]: unknown }>;

export type IsochroneFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  { contour?: number; minutes?: number; [k: string]: unknown }
>;

function validateInput(input: ComputeIsochroneInput): void {
  if (!Number.isFinite(input.lat) || input.lat < -90 || input.lat > 90) {
    throw new Error("Invalid latitude");
  }
  if (!Number.isFinite(input.lng) || input.lng < -180 || input.lng > 180) {
    throw new Error("Invalid longitude");
  }
  if (!Array.isArray(input.minutes) || input.minutes.length === 0) {
    throw new Error("minutes must be a non-empty array");
  }
  if (input.minutes.length > 4) {
    throw new Error("Mapbox Isochrone API accepts at most 4 contour values");
  }
  for (const m of input.minutes) {
    if (!Number.isInteger(m) || m < 1 || m > 60) {
      throw new Error(`Invalid minutes value: ${m} (must be integer 1..60)`);
    }
  }
}

/**
 * Fetches a Mapbox Isochrone polygon FeatureCollection for the given
 * origin point and drive-time bands (in minutes).
 *
 * @throws {IsochroneConfigError} When `MAPBOX_ACCESS_TOKEN` is unset.
 * @throws {IsochroneUpstreamError} When Mapbox returns a non-2xx response.
 */
export async function computeIsochrone(
  input: ComputeIsochroneInput,
): Promise<IsochroneFeatureCollection> {
  validateInput(input);

  const token = process.env.MAPBOX_ACCESS_TOKEN?.trim();
  if (!token) {
    throw new IsochroneConfigError();
  }

  const { lat, lng, minutes } = input;
  const contours = minutes.join(",");
  const url = `${MAPBOX_ISOCHRONE_ENDPOINT}/${lng},${lat}?contours_minutes=${contours}&polygons=true&access_token=${encodeURIComponent(
    token,
  )}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MAPBOX_FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      const text = await safeText(res);
      throw new IsochroneUpstreamError(
        res.status,
        `Mapbox isochrone upstream returned ${res.status}: ${text}`,
      );
    }
    const data = (await res.json()) as IsochroneFeatureCollection;
    // Normalize features: ensure `minutes` property mirrors `contour` (the
    // Mapbox API uses `contour` but callers often key off `minutes`).
    if (data && Array.isArray(data.features)) {
      data.features = data.features.map((f): IsochroneFeature => {
        const props = { ...(f.properties ?? {}) } as Record<string, unknown>;
        if (props.contour !== undefined && props.minutes === undefined) {
          props.minutes = props.contour;
        }
        return { ...f, properties: props };
      });
    }
    return data;
  } catch (err) {
    if (err instanceof IsochroneUpstreamError || err instanceof IsochroneConfigError) {
      throw err;
    }
    if (err instanceof Error && err.name === "AbortError") {
      throw new IsochroneUpstreamError(504, "Mapbox isochrone request timed out");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "<no body>";
  }
}
