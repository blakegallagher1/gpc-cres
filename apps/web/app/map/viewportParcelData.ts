import type { MapParcel } from "@/components/maps/types";
import type { ViewportBounds } from "@/components/maps/useParcelGeometry";
import { normalizeParcelId } from "@/lib/maps/parcelIdentity";

/**
 * Prospecting parcel row returned by `/api/map/prospect`.
 */
export interface ProspectApiParcel {
  id: string;
  parcelId?: string | null;
  address: string;
  lat: number;
  lng: number;
  acreage: number | null;
  floodZone: string;
  zoning: string;
  propertyDbId: string;
}

/**
 * Prospecting response payload returned by `/api/map/prospect`.
 */
export interface ProspectApiResponse {
  parcels: ProspectApiParcel[];
  total: number;
  error?: string;
  code?: string;
}

/**
 * Normalized result returned by the viewport/polygon parcel request helpers.
 */
export interface ProspectParcelRequestResult {
  parcels: MapParcel[];
  error: string | null;
  unauthorized: boolean;
}

/**
 * Converts viewport bounds into the rectangle polygon accepted by
 * `/api/map/prospect`.
 */
export function viewportBoundsToPolygon(bounds: ViewportBounds): number[][][] {
  return [[
    [bounds.west, bounds.south],
    [bounds.east, bounds.south],
    [bounds.east, bounds.north],
    [bounds.west, bounds.north],
    [bounds.west, bounds.south],
  ]];
}

/**
 * Normalizes prospecting API parcels into the map surface parcel type.
 */
export function mapProspectParcels(data: ProspectApiResponse): MapParcel[] {
  return (data.parcels as ProspectApiParcel[]).reduce<MapParcel[]>((acc, parcel) => {
    const lat = Number(parcel.lat);
    const lng = Number(parcel.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return acc;
    }

    const mapParcelId = parcel.id?.trim();
    const geometryLookupKey =
      parcel.propertyDbId?.trim() ??
      normalizeParcelId(parcel.parcelId ?? parcel.id);
    if (!mapParcelId || !geometryLookupKey) {
      return acc;
    }

    acc.push({
      id: mapParcelId,
      parcelId: mapParcelId,
      address: (parcel.address ?? "Unknown").trim(),
      lat,
      lng,
      floodZone: (parcel.floodZone ?? "").trim() || null,
      currentZoning: (parcel.zoning ?? "").trim() || null,
      propertyDbId: parcel.propertyDbId?.trim() ?? null,
      geometryLookupKey,
      acreage: parcel.acreage != null ? Number(parcel.acreage) : null,
    });

    return acc;
  }, []);
}

/**
 * Executes the existing prospecting route against an arbitrary polygon and
 * returns normalized map parcels without changing the public route contract.
 */
export async function requestProspectParcels(params: {
  polygon: number[][][];
  searchText?: string;
  fetchImpl?: typeof fetch;
}): Promise<ProspectParcelRequestResult> {
  const fetchImpl = params.fetchImpl ?? fetch;
  const response = await fetchImpl("/api/map/prospect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      polygon: { type: "Polygon", coordinates: params.polygon },
      filters: {
        searchText:
          params.searchText && params.searchText.trim().length > 0
            ? params.searchText.trim()
            : "*",
      },
    }),
  });

  if (!response.ok) {
    let apiError: ProspectApiResponse | null = null;
    try {
      apiError = (await response.json()) as ProspectApiResponse;
    } catch {
      apiError = null;
    }
    return {
      parcels: [],
      error:
        response.status === 401
          ? "You must be signed in to use polygon search."
          : apiError?.error?.trim() || "Polygon search failed. Please try again.",
      unauthorized: response.status === 401,
    };
  }

  const data = (await response.json()) as ProspectApiResponse;
  if (data.error) {
    return {
      parcels: [],
      error: data.error,
      unauthorized: false,
    };
  }

  return {
    parcels: mapProspectParcels(data),
    error: null,
    unauthorized: false,
  };
}

/**
 * Refreshes the current viewport parcel set through the existing prospecting
 * route by submitting the viewport rectangle as a polygon.
 */
export function requestViewportParcels(params: {
  bounds: ViewportBounds;
  fetchImpl?: typeof fetch;
}): Promise<ProspectParcelRequestResult> {
  return requestProspectParcels({
    polygon: viewportBoundsToPolygon(params.bounds),
    fetchImpl: params.fetchImpl,
  });
}
