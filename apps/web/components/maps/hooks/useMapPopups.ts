"use client";

import { useEffect } from "react";
import { useMap } from "@vis.gl/react-maplibre";

/**
 * Click handlers for the V2 map surface.
 */
export function useMapPopups(params: {
  onParcelClick?: ((parcelId: string) => void) | undefined;
  onClusterClick?: ((center: [number, number], zoom: number) => void) | undefined;
}) {
  const { current: map } = useMap();

  useEffect(() => {
    if (!map) return;
    const rawMap = map.getMap();

    const handleParcelClick = (event: maplibregl.MapLayerMouseEvent) => {
      const parcelId = event.features?.[0]?.properties?.id as string | undefined;
      if (!parcelId) return;
      params.onParcelClick?.(parcelId);
    };

    const handleClusterClick = (event: maplibregl.MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      if (!feature?.properties || !("point_count" in feature.properties)) return;
      const center: [number, number] =
        feature.geometry?.type === "Point"
          ? (feature.geometry.coordinates as [number, number])
          : [event.lngLat.lng, event.lngLat.lat];
      params.onClusterClick?.(center, Math.min(rawMap.getZoom() + 2, 22));
    };

    rawMap.on("click", "parcel-points", handleParcelClick);
    rawMap.on("click", "parcel-clusters", handleClusterClick);
    return () => {
      rawMap.off("click", "parcel-points", handleParcelClick);
      rawMap.off("click", "parcel-clusters", handleClusterClick);
    };
  }, [map, params]);
}
