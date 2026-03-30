"use client";

import { Source, Layer } from "@vis.gl/react-maplibre";
import { getMartinParcelTileUrl } from "../tileUrls";

interface SoilsLayerProps {
  visible: boolean;
}

export function SoilsLayer({ visible }: SoilsLayerProps) {
  return (
    <Source
      id="soils-tiles"
      type="vector"
      tiles={[getMartinParcelTileUrl("soils")]}
      minzoom={5}
      maxzoom={22}
    >
      <Layer
        id="soils-tiles-fill"
        type="fill"
        source-layer="soils"
        layout={{ visibility: visible ? "visible" : "none" }}
        paint={{
          "fill-color": [
            "match",
            ["get", "hydric_rating"],
            "Hydric",
            "#dc2626",
            "Partially Hydric",
            "#f59e0b",
            "Non-Hydric",
            "#16a34a",
            "#9ca3af",
          ],
          "fill-opacity": 0.25,
        }}
      />
    </Source>
  );
}
