import type { MapFeature } from "./mapActionTypes";

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

/**
 * Normalizes a gateway parcel result (from parcel.lookup, parcel.bbox, etc.)
 * into a MapFeature for the SSE pipeline.
 */
export function normalizeParcelToMapFeature(
  parcel: Record<string, unknown>
): MapFeature {
  const id = String(
    parcel.parcel_id ?? parcel.parcelId ?? parcel.id ?? ""
  );
  const address = String(
    parcel.site_addr ?? parcel.siteAddr ?? parcel.address ?? ""
  );
  const zoning = parcel.zoning_type ?? parcel.zoningType;
  const owner = parcel.owner ?? parcel.owner_name ?? parcel.ownerName;
  const acres = parcel.acres ?? parcel.area_acres ?? parcel.areaAcres;

  // Center from centroid fields or geometry
  let center: { lat: number; lng: number } | undefined;
  const latitude = toFiniteNumber(parcel.latitude);
  const longitude = toFiniteNumber(parcel.longitude);
  const centroidLat = toFiniteNumber(parcel.centroid_lat);
  const centroidLng = toFiniteNumber(parcel.centroid_lng);

  if (latitude !== undefined && longitude !== undefined) {
    center = {
      lat: latitude,
      lng: longitude,
    };
  } else if (centroidLat !== undefined && centroidLng !== undefined) {
    center = {
      lat: centroidLat,
      lng: centroidLng,
    };
  }

  // Geometry if present (GeoJSON format from gateway)
  let geometry: GeoJSON.Geometry | undefined;
  if (parcel.geojson && typeof parcel.geojson === "object") {
    geometry = parcel.geojson as GeoJSON.Geometry;
  } else if (parcel.geometry && typeof parcel.geometry === "object") {
    geometry = parcel.geometry as GeoJSON.Geometry;
  }

  return {
    parcelId: id,
    address: address || undefined,
    zoningType: typeof zoning === "string" ? zoning : undefined,
    owner: typeof owner === "string" ? owner : undefined,
    acres: toFiniteNumber(acres),
    label: address || id,
    center,
    geometry,
  };
}
