"use client";

import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet.heat";
import type { MapParcel } from "./ParcelMap";

// ---------------------------------------------------------------------------
// HeatmapLayer
// ---------------------------------------------------------------------------

interface HeatmapLayerProps {
  parcels: MapParcel[];
  visible: boolean;
}

/**
 * Renders a heatmap overlay based on parcel locations.
 * Intensity is weighted by acreage (larger parcels = hotter spots).
 * Falls back to uniform weight if acreage data is unavailable.
 */
export function HeatmapLayer({ parcels, visible }: HeatmapLayerProps) {
  const map = useMap();
  const layerRef = useRef<L.Layer | null>(null);

  useEffect(() => {
    if (!visible) {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
      return;
    }

    // Build heat data: [lat, lng, intensity]
    const maxAcreage = Math.max(
      ...parcels.map((p) => (p.acreage ? Number(p.acreage) : 1)),
      1
    );

    const heatData: [number, number, number][] = parcels.map((p) => {
      const intensity = p.acreage ? Number(p.acreage) / maxAcreage : 0.3;
      return [p.lat, p.lng, intensity];
    });

    if (heatData.length === 0) return;

    // Create or update heat layer
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
    }

    const heat = L.heatLayer(heatData, {
      radius: 25,
      blur: 15,
      maxZoom: 17,
      max: 1.0,
      gradient: {
        0.0: "#3b82f6",
        0.3: "#22d3ee",
        0.5: "#22c55e",
        0.7: "#eab308",
        0.9: "#ef4444",
      },
    });

    heat.addTo(map);
    layerRef.current = heat;

    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [map, parcels, visible]);

  return null;
}
