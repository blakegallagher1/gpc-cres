import type { MutableRefObject } from "react";
import type maplibregl from "maplibre-gl";
import type { MapParcel } from "./types";
import type { ViewportBounds } from "./useParcelGeometry";

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
 * Binds the parcel/tile click, hover, and viewport listeners used by the map
 * surface, returning a cleanup callback for the registered handlers.
 */
export function bindMapInteractionHandlers(params: {
  map: maplibregl.Map;
  fitBounds: () => void;
  onParcelClick?: ((parcelId: string) => void) | undefined;
  updateSelection: (parcelId: string, isMultiSelect: boolean) => void;
  getParcelById: (parcelId: string) => MapParcel | undefined;
  openParcelPopup: (parcel: MapParcel, lngLat: [number, number]) => void;
  openTilePopup: (properties: Record<string, unknown>, lngLat: [number, number]) => void;
  setCursor: (lng: number, lat: number) => void;
  setZoom: (zoom: number) => void;
  setViewportBounds: (bounds: ViewportBounds) => void;
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
      params.openParcelPopup(parcel, [event.lngLat.lng, event.lngLat.lat]);
    }
  };

  const handleTileParcelClick = (event: maplibregl.MapLayerMouseEvent) => {
    const feature = event.features?.[0];
    if (!feature?.properties) {
      return;
    }
    const tileParcelId = feature.properties.id as string | undefined;
    if (tileParcelId && params.getParcelById(tileParcelId)) {
      return;
    }

    params.openTilePopup(feature.properties, [event.lngLat.lng, event.lngLat.lat]);
  };

  const handleMouseEnter = () => {
    map.getCanvas().style.cursor = "pointer";
  };

  const handleMouseLeave = () => {
    map.getCanvas().style.cursor = "";
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
  map.on("click", "parcel-tiles-fill", handleTileParcelClick);

  map.on("mouseenter", "parcels-boundary-line", handleMouseEnter);
  map.on("mouseenter", "parcels-boundary-fill", handleMouseEnter);
  map.on("mouseenter", "parcel-points", handleMouseEnter);
  map.on("mouseenter", "parcel-tiles-fill", handleMouseEnter);
  map.on("mouseleave", "parcels-boundary-line", handleMouseLeave);
  map.on("mouseleave", "parcels-boundary-fill", handleMouseLeave);
  map.on("mouseleave", "parcel-points", handleMouseLeave);
  map.on("mouseleave", "parcel-tiles-fill", handleMouseLeave);

  map.on("mousemove", handleMouseMove);
  map.on("zoomend", handleZoomEnd);
  map.on("moveend", handleMoveEnd);

  return () => {
    map.off("click", "parcels-boundary-line", handleFeatureClick);
    map.off("click", "parcels-boundary-fill", handleFeatureClick);
    map.off("click", "parcel-points", handleFeatureClick);
    map.off("click", "parcel-tiles-fill", handleTileParcelClick);
    map.off("mouseenter", "parcels-boundary-line", handleMouseEnter);
    map.off("mouseenter", "parcels-boundary-fill", handleMouseEnter);
    map.off("mouseenter", "parcel-points", handleMouseEnter);
    map.off("mouseenter", "parcel-tiles-fill", handleMouseEnter);
    map.off("mouseleave", "parcels-boundary-line", handleMouseLeave);
    map.off("mouseleave", "parcels-boundary-fill", handleMouseLeave);
    map.off("mouseleave", "parcel-points", handleMouseLeave);
    map.off("mouseleave", "parcel-tiles-fill", handleMouseLeave);
    map.off("mousemove", handleMouseMove);
    map.off("zoomend", handleZoomEnd);
    map.off("moveend", handleMoveEnd);
  };
}
