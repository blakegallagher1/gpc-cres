import type { MapActionPayload, MapFeature } from "./mapActionTypes";

function deriveFeatureCenter(
  geometry: GeoJSON.Geometry | null | undefined,
): { lat: number; lng: number } | undefined {
  if (!geometry) return undefined;

  if (geometry.type === "Point") {
    return {
      lng: Number(geometry.coordinates[0]),
      lat: Number(geometry.coordinates[1]),
    };
  }

  const coordinates: Array<[number, number]> = [];

  const collect = (value: unknown): void => {
    if (!Array.isArray(value)) return;

    if (
      value.length >= 2 &&
      typeof value[0] === "number" &&
      typeof value[1] === "number"
    ) {
      coordinates.push([value[0], value[1]]);
      return;
    }

    for (const item of value) {
      collect(item);
    }
  };

  collect((geometry as { coordinates?: unknown }).coordinates);

  if (coordinates.length === 0) return undefined;

  const [sumLng, sumLat] = coordinates.reduce(
    ([lngAcc, latAcc], [lng, lat]) => [lngAcc + lng, latAcc + lat],
    [0, 0],
  );

  return {
    lng: sumLng / coordinates.length,
    lat: sumLat / coordinates.length,
  };
}

export function mapFeaturesFromGeoJson(
  geojson: GeoJSON.FeatureCollection,
): MapFeature[] {
  return geojson.features
    .filter((feature): feature is GeoJSON.Feature<GeoJSON.Geometry> =>
      Boolean(feature?.geometry),
    )
    .map((feature) => {
      const properties =
        feature.properties && typeof feature.properties === "object"
          ? (feature.properties as Record<string, unknown>)
          : {};
      const parcelId =
        typeof properties.parcelId === "string"
          ? properties.parcelId
          : typeof properties.parcel_id === "string"
            ? properties.parcel_id
            : "";

      return {
        parcelId,
        address:
          typeof properties.address === "string" ? properties.address : undefined,
        zoningType:
          typeof properties.zoning === "string"
            ? properties.zoning
            : typeof properties.zoningType === "string"
              ? properties.zoningType
              : undefined,
        label:
          typeof properties.label === "string"
            ? properties.label
            : typeof properties.address === "string"
              ? properties.address
              : parcelId || undefined,
        geometry: feature.geometry,
        center: deriveFeatureCenter(feature.geometry),
      };
    })
    .filter((feature) => feature.parcelId.length > 0);
}

export function mergeMapFeatures(
  existing: MapFeature[],
  incoming: MapFeature[],
): MapFeature[] {
  const merged = new Map<string, MapFeature>();

  for (const feature of existing) {
    if (!feature.parcelId) continue;
    merged.set(feature.parcelId, feature);
  }

  for (const feature of incoming) {
    if (!feature.parcelId) continue;
    const current = merged.get(feature.parcelId);
    merged.set(feature.parcelId, {
      parcelId: feature.parcelId,
      address: feature.address ?? current?.address,
      zoningType: feature.zoningType ?? current?.zoningType,
      owner: feature.owner ?? current?.owner,
      acres: feature.acres ?? current?.acres,
      label: feature.label ?? current?.label,
      center: feature.center ?? current?.center,
      geometry: feature.geometry ?? current?.geometry,
    });
  }

  return Array.from(merged.values());
}

export function mapFeaturesFromActionPayload(
  payload: MapActionPayload,
): MapFeature[] {
  if (payload.action !== "addLayer") {
    return [];
  }

  return mapFeaturesFromGeoJson(payload.geojson);
}
