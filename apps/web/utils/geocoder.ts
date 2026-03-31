import type { MapParcel } from "@/components/maps/types";
import {
  canonicalizeParcelSearchText,
  parcelMatchesSearch,
} from "@/app/map/searchHelpers";

/**
 * Geocoded place surfaced by the map search overlay.
 */
export interface GeocodedPlace {
  id: string;
  label: string;
  center: [number, number];
  source: "parcel" | "nominatim" | "mapbox";
  parcelId?: string;
  address?: string;
  owner?: string | null;
  zoom?: number;
}

const DEFAULT_LIMIT = 6;
const NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org/search";
const MAPBOX_BASE_URL = "https://api.mapbox.com/geocoding/v5/mapbox.places";

function rankParcelForQuery(parcel: MapParcel, normalizedQuery: string): number {
  const fields = [
    parcel.address,
    parcel.owner,
    parcel.currentZoning,
    parcel.floodZone,
    parcel.propertyDbId,
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => canonicalizeParcelSearchText(value));

  if (fields.some((field) => field === normalizedQuery)) return 0;
  if (fields.some((field) => field.startsWith(normalizedQuery))) return 1;
  if (fields.some((field) => field.includes(normalizedQuery))) return 2;
  return 3;
}

/**
 * Returns local parcels that match the search text, ordered by strongest match.
 */
export function searchLocalGeocodedPlaces(
  parcels: readonly MapParcel[],
  query: string,
  limit: number = DEFAULT_LIMIT,
): GeocodedPlace[] {
  const normalizedQuery = canonicalizeParcelSearchText(query);
  if (!normalizedQuery || normalizedQuery.length < 2) {
    return [];
  }

  return parcels
    .filter((parcel) => parcelMatchesSearch(parcel, query))
    .map((parcel) => ({
      id: `parcel:${parcel.id}`,
      label: parcel.address,
      center: [parcel.lng, parcel.lat] as [number, number],
      source: "parcel" as const,
      parcelId: parcel.id,
      address: parcel.address,
      owner: parcel.owner ?? null,
      zoom: 17,
      score: rankParcelForQuery(parcel, normalizedQuery),
    }))
    .sort((a, b) => a.score - b.score || a.label.localeCompare(b.label))
    .slice(0, limit)
    .map(({ score: _score, ...place }) => place);
}

function dedupePlaces(places: GeocodedPlace[]): GeocodedPlace[] {
  const seen = new Set<string>();
  const deduped: GeocodedPlace[] = [];

  for (const place of places) {
    const key = `${canonicalizeParcelSearchText(place.label)}:${place.center[0].toFixed(6)}:${place.center[1].toFixed(6)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(place);
  }

  return deduped;
}

/**
 * Queries Nominatim for address-like results.
 */
export async function searchNominatimPlaces(
  query: string,
  limit: number = DEFAULT_LIMIT,
  signal?: AbortSignal,
): Promise<GeocodedPlace[]> {
  const normalizedQuery = canonicalizeParcelSearchText(query);
  if (!normalizedQuery) return [];

  const params = new URLSearchParams({
    format: "jsonv2",
    q: query,
    limit: String(limit),
    addressdetails: "1",
  });
  const response = await fetch(`${NOMINATIM_BASE_URL}?${params.toString()}`, {
    method: "GET",
    signal,
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return [];
  }

  const data = (await response.json()) as unknown;
  if (!Array.isArray(data)) return [];

  const places: GeocodedPlace[] = [];
  for (const [index, row] of data.entries()) {
    if (!row || typeof row !== "object") continue;
    const entry = row as Record<string, unknown>;
    const lat = Number(entry.lat);
    const lon = Number(entry.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const label = typeof entry.display_name === "string" ? entry.display_name : query;
    places.push({
      id: `nominatim:${index}:${label}`,
      label,
      center: [lon, lat] as [number, number],
      source: "nominatim" as const,
      zoom: 16,
    });
  }

  return places.slice(0, limit);
}

/**
 * Queries Mapbox geocoding when a public token is available.
 */
export async function searchMapboxPlaces(
  query: string,
  limit: number = DEFAULT_LIMIT,
  signal?: AbortSignal,
): Promise<GeocodedPlace[]> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim();
  const normalizedQuery = canonicalizeParcelSearchText(query);
  if (!token || !normalizedQuery) return [];

  const endpoint = `${MAPBOX_BASE_URL}/${encodeURIComponent(query)}.json`;
  const params = new URLSearchParams({
    autocomplete: "true",
    limit: String(limit),
    types: "address,place,neighborhood,postcode",
    access_token: token,
  });
  const response = await fetch(`${endpoint}?${params.toString()}`, {
    method: "GET",
    signal,
    cache: "no-store",
  });

  if (!response.ok) {
    return [];
  }

  const data = (await response.json()) as unknown;
  if (!data || typeof data !== "object") return [];

  const features = Array.isArray((data as Record<string, unknown>).features)
    ? (data as Record<string, unknown>).features as unknown[]
    : [];

  const places: GeocodedPlace[] = [];
  for (const [index, feature] of features.entries()) {
    if (!feature || typeof feature !== "object") continue;
    const entry = feature as Record<string, unknown>;
    const center = Array.isArray(entry.center) && entry.center.length >= 2
      ? entry.center
      : null;
    if (!center) continue;
    const lng = Number(center[0]);
    const lat = Number(center[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const label = typeof entry.place_name === "string" ? entry.place_name : query;
    places.push({
      id: `mapbox:${index}:${label}`,
      label,
      center: [lng, lat] as [number, number],
      source: "mapbox" as const,
      zoom: 16,
    });
  }

  return places.slice(0, limit);
}

/**
 * Returns the best available geocoder results, preferring local parcel
 * matches and then falling back to public geocoding services.
 */
export async function searchGeocodedPlaces(
  query: string,
  parcels: readonly MapParcel[],
  options?: {
    limit?: number;
    signal?: AbortSignal;
  },
): Promise<GeocodedPlace[]> {
  const limit = options?.limit ?? DEFAULT_LIMIT;
  const localPlaces = searchLocalGeocodedPlaces(parcels, query, limit);
  if (localPlaces.length >= limit) {
    return localPlaces;
  }

  const externalLimit = Math.max(limit - localPlaces.length, 1);
  const [nominatimPlaces, mapboxPlaces] = await Promise.all([
    searchNominatimPlaces(query, externalLimit, options?.signal).catch(() => []),
    searchMapboxPlaces(query, externalLimit, options?.signal).catch(() => []),
  ]);

  return dedupePlaces([...localPlaces, ...nominatimPlaces, ...mapboxPlaces]).slice(0, limit);
}
