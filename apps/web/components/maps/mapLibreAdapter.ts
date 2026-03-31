import type { MutableRefObject } from "react";
import type maplibregl from "maplibre-gl";
import type { MapParcel } from "./types";
import type { ViewportBounds } from "./useParcelGeometry";

/**
 * Minimal parcel payload used by hover tooltips when a full parcel record is
 * not available yet.
 */
export interface ParcelHoverTarget {
  id: string;
  address: string;
  propertyDbId?: string | null;
  owner?: string | null;
  acreage?: number | null;
  currentZoning?: string | null;
  floodZone?: string | null;
  dealName?: string | null;
  dealStatus?: string | null;
}

function parseStringValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseNumberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Reads the current viewport bounds from a live MapLibre map instance.
 */
export function readViewportBounds(map: maplibregl.Map): ViewportBounds {
  const bounds = map.getBounds();
  return {
    west: bounds.getWest(),
    south: bounds.getSouth(),
    east: bounds.getEast(),
    north: bounds.getNorth(),
  };
}

/**
 * Builds a hover payload from a MapLibre feature or a resolved parcel record.
 */
export function buildParcelHoverTarget(params: {
  properties?: Record<string, unknown> | undefined;
  parcelId?: string | undefined;
  parcel?: MapParcel | undefined;
}): ParcelHoverTarget | null {
  if (params.parcel) {
    return {
      id: params.parcel.id,
      address: params.parcel.address,
      propertyDbId: params.parcel.propertyDbId ?? null,
      owner: params.parcel.owner ?? null,
      acreage: params.parcel.acreage ?? null,
      currentZoning: params.parcel.currentZoning ?? null,
      floodZone: params.parcel.floodZone ?? null,
      dealName: params.parcel.dealName ?? null,
      dealStatus: params.parcel.dealStatus ?? null,
    };
  }

  const properties = params.properties;
  if (!properties) return null;

  const address =
    parseStringValue(properties.address) ??
    parseStringValue(properties.site_address) ??
    parseStringValue(properties.situs_address) ??
    parseStringValue(properties.parcel_address) ??
    "Unknown address";
  const resolvedId =
    params.parcelId ??
    parseStringValue(properties.id) ??
    parseStringValue(properties.parcel_id) ??
    parseStringValue(properties.parcel_uid) ??
    parseStringValue(properties.apn) ??
    parseStringValue(properties.property_db_id) ??
    address;

  return {
    id: resolvedId,
    address,
    propertyDbId:
      parseStringValue(properties.propertyDbId) ??
      parseStringValue(properties.property_db_id) ??
      parseStringValue(properties.parcel_uid) ??
      parseStringValue(properties.parcel_id) ??
      parseStringValue(properties.id),
    owner:
      parseStringValue(properties.owner) ??
      parseStringValue(properties.owner_name) ??
      parseStringValue(properties.taxpayer_name),
    acreage: parseNumberValue(properties.acreage),
    currentZoning:
      parseStringValue(properties.currentZoning) ??
      parseStringValue(properties.zoning) ??
      parseStringValue(properties.zone_code),
    floodZone:
      parseStringValue(properties.floodZone) ??
      parseStringValue(properties.flood_zone) ??
      parseStringValue(properties.zone),
    dealName: parseStringValue(properties.dealName) ?? parseStringValue(properties.deal_name),
    dealStatus: parseStringValue(properties.dealStatus) ?? parseStringValue(properties.deal_status),
  };
}

/**
 * Binds the parcel/tile click, hover, and viewport listeners used by the map
 * surface, returning a cleanup callback for the registered handlers.
 */
export function bindMapInteractionHandlers(params: {
  map: maplibregl.Map;
  fitBounds: () => void;
  onParcelClick?: ((parcelId: string) => void) | undefined;
  updateSelection: (parcelId: string, isMultiSelect: boolean) => void;
  getParcelById: (parcelId: string) => MapParcel | undefined;
  openParcelPopup: (parcel: MapParcel, lngLat: [number, number], point?: [number, number]) => void;
  openTilePopup: (properties: Record<string, unknown>, lngLat: [number, number]) => void;
  setCursor: (lng: number, lat: number) => void;
  setZoom: (zoom: number) => void;
  setViewportBounds: (bounds: ViewportBounds) => void;
  onParcelHover?: ((parcel: ParcelHoverTarget, lngLat: [number, number], point: [number, number]) => void) | undefined;
  onParcelHoverEnd?: (() => void) | undefined;
  onViewStateChange?: ((center: [number, number], zoom: number, bounds?: ViewportBounds) => void) | undefined;
  boundsTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
}): () => void {
  const { map } = params;

  const handleFeatureClick = (event: maplibregl.MapLayerMouseEvent) => {
    const parcelId = event.features?.[0]?.properties?.id as string | undefined;
    if (!parcelId) {
      return;
    }

    const isMultiSelect = event.originalEvent?.ctrlKey || event.originalEvent?.metaKey;
    params.updateSelection(parcelId, isMultiSelect);
    params.onParcelClick?.(parcelId);

    const parcel = params.getParcelById(parcelId);
    if (parcel) {
      params.openParcelPopup(parcel, [event.lngLat.lng, event.lngLat.lat], [event.point.x, event.point.y]);
    }
  };

  const handleTileParcelClick = (event: maplibregl.MapLayerMouseEvent) => {
    const feature = event.features?.[0];
    if (!feature?.properties) {
      return;
    }
    const tileParcelId = feature.properties.id as string | undefined;

    // If parcel exists in the active set, let the GeoJSON layer handler manage
    // selection; only fall through to tile popup for parcels not already loaded.
    const knownParcel = tileParcelId ? params.getParcelById(tileParcelId) : undefined;
    if (knownParcel) {
      params.openParcelPopup(knownParcel, [event.lngLat.lng, event.lngLat.lat], [event.point.x, event.point.y]);
      return;
    }

    params.openTilePopup(feature.properties, [event.lngLat.lng, event.lngLat.lat]);
  };

  const handleClusterClick = (event: maplibregl.MapLayerMouseEvent) => {
    const feature = event.features?.[0];
    if (!feature?.properties || !("point_count" in feature.properties)) {
      return;
    }

    const clusterCoordinates: [number, number] = feature.geometry?.type === "Point"
      ? (feature.geometry.coordinates as [number, number])
      : [event.lngLat.lng, event.lngLat.lat];
    const nextZoom = Math.min(map.getZoom() + 2, 22);
    map.flyTo({
      center: clusterCoordinates,
      zoom: nextZoom,
    });
  };

  const handleMouseEnter = () => {
    map.getCanvas().style.cursor = "pointer";
  };

  const handleMouseLeave = () => {
    map.getCanvas().style.cursor = "";
    params.onParcelHoverEnd?.();
  };

  const handleHover = (event: maplibregl.MapLayerMouseEvent) => {
    const feature = event.features?.[0];
    if (!feature) {
      params.onParcelHoverEnd?.();
      return;
    }

    const parcelId = parseStringValue(feature.properties?.id);
    const parcel = parcelId ? params.getParcelById(parcelId) : undefined;
    const hoverTarget = buildParcelHoverTarget({
      properties: feature.properties,
      parcelId: parcelId ?? undefined,
      parcel,
    });

    if (!hoverTarget) {
      params.onParcelHoverEnd?.();
      return;
    }

    params.onParcelHover?.(
      hoverTarget,
      [event.lngLat.lng, event.lngLat.lat],
      [event.point.x, event.point.y],
    );
  };

  const handleMouseMove = (event: maplibregl.MapMouseEvent) => {
    params.setCursor(
      Math.round(event.lngLat.lng * 10000) / 10000,
      Math.round(event.lngLat.lat * 10000) / 10000,
    );
  };

  const handleZoomEnd = () => {
    params.setZoom(Math.round(map.getZoom() * 100) / 100);
  };

  const handleMoveEnd = () => {
    params.fitBounds();
    if (params.boundsTimerRef.current) {
      clearTimeout(params.boundsTimerRef.current);
    }
    params.boundsTimerRef.current = setTimeout(() => {
      const bounds = readViewportBounds(map);
      params.setViewportBounds(bounds);
      params.onViewStateChange?.(
        [map.getCenter().lat, map.getCenter().lng],
        map.getZoom(),
        bounds,
      );
    }, 300);
  };

  map.on("click", "parcels-boundary-line", handleFeatureClick);
  map.on("click", "parcels-boundary-fill", handleFeatureClick);
  map.on("click", "parcel-points", handleFeatureClick);
  map.on("click", "parcel-clusters", handleClusterClick);
  map.on("click", "parcel-tiles-fill", handleTileParcelClick);

  map.on("mouseenter", "parcels-boundary-line", handleMouseEnter);
  map.on("mouseenter", "parcels-boundary-fill", handleMouseEnter);
  map.on("mouseenter", "parcel-points", handleMouseEnter);
  map.on("mouseenter", "parcel-clusters", handleMouseEnter);
  map.on("mouseenter", "parcel-tiles-fill", handleMouseEnter);
  map.on("mousemove", "parcels-boundary-line", handleHover);
  map.on("mousemove", "parcels-boundary-fill", handleHover);
  map.on("mousemove", "parcel-points", handleHover);
  map.on("mousemove", "parcel-tiles-fill", handleHover);
  map.on("mouseleave", "parcels-boundary-line", handleMouseLeave);
  map.on("mouseleave", "parcels-boundary-fill", handleMouseLeave);
  map.on("mouseleave", "parcel-points", handleMouseLeave);
  map.on("mouseleave", "parcel-clusters", handleMouseLeave);
  map.on("mouseleave", "parcel-tiles-fill", handleMouseLeave);

  map.on("mousemove", handleMouseMove);
  map.on("zoomend", handleZoomEnd);
  map.on("moveend", handleMoveEnd);

  return () => {
    map.off("click", "parcels-boundary-line", handleFeatureClick);
    map.off("click", "parcels-boundary-fill", handleFeatureClick);
    map.off("click", "parcel-points", handleFeatureClick);
    map.off("click", "parcel-clusters", handleClusterClick);
    map.off("click", "parcel-tiles-fill", handleTileParcelClick);
    map.off("mouseenter", "parcels-boundary-line", handleMouseEnter);
    map.off("mouseenter", "parcels-boundary-fill", handleMouseEnter);
    map.off("mouseenter", "parcel-points", handleMouseEnter);
    map.off("mouseenter", "parcel-clusters", handleMouseEnter);
    map.off("mouseenter", "parcel-tiles-fill", handleMouseEnter);
    map.off("mousemove", "parcels-boundary-line", handleHover);
    map.off("mousemove", "parcels-boundary-fill", handleHover);
    map.off("mousemove", "parcel-points", handleHover);
    map.off("mousemove", "parcel-tiles-fill", handleHover);
    map.off("mouseleave", "parcels-boundary-line", handleMouseLeave);
    map.off("mouseleave", "parcels-boundary-fill", handleMouseLeave);
    map.off("mouseleave", "parcel-points", handleMouseLeave);
    map.off("mouseleave", "parcel-clusters", handleMouseLeave);
    map.off("mouseleave", "parcel-tiles-fill", handleMouseLeave);
    map.off("mousemove", handleMouseMove);
    map.off("zoomend", handleZoomEnd);
    map.off("moveend", handleMoveEnd);
  };
}
