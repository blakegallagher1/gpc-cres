"use client";

import { Source, Layer } from "@vis.gl/react-maplibre";
import { getMartinParcelTileUrl } from "../tileUrls";

interface ParcelExtrusionLayerProps {
  visible: boolean;
}

/**
 * 3D fill-extrusion layer on parcel boundaries.
 * Extrudes parcels by lot_area_sqft (taller = larger lot).
 * Requires map pitch > 0 to be visible — the map auto-pitches when enabled.
 */
export function ParcelExtrusionLayer({ visible }: ParcelExtrusionLayerProps) {
  return (
    <Source
      id="parcel-extrusion-tiles"
      type="vector"
      tiles={[getMartinParcelTileUrl("ebr_parcels")]}
      minzoom={12}
      maxzoom={22}
    >
      <Layer
        id="parcel-extrusion-3d"
        type="fill-extrusion"
        source-layer="ebr_parcels"
        minzoom={12}
        layout={{ visibility: visible ? "visible" : "none" }}
        paint={{
          // Height driven by lot_area_sqft — log scale so small lots are visible
          // Clamp between 5m and 300m for visual clarity
          "fill-extrusion-height": [
            "interpolate",
            ["linear"],
            ["coalesce", ["get", "lot_area_sqft"], 5000],
            0, 5,
            5000, 20,
            20000, 60,
            50000, 120,
            200000, 200,
            500000, 300,
          ],
          "fill-extrusion-base": 0,
          // Color by zoning type — commercial/industrial are warm, residential cool
          "fill-extrusion-color": [
            "match",
            ["coalesce", ["get", "zoning_type"], ""],
            "M1", "#f97316",  // Industrial - orange
            "M2", "#ea580c",
            "M3", "#c2410c",
            "C1", "#8b5cf6",  // Commercial - purple
            "C2", "#7c3aed",
            "C3", "#6d28d9",
            "C4", "#5b21b6",
            "C5", "#4c1d95",
            "A1", "#22c55e",  // Residential - green
            "A2", "#16a34a",
            "A3", "#15803d",
            "A4", "#166534",
            "A5", "#14532d",
            "#facc15",        // Default - yellow (matches parcel boundary color)
          ],
          "fill-extrusion-opacity": 0.75,
        }}
      />
    </Source>
  );
}
