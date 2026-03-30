"use client";

import { Source, Layer } from "@vis.gl/react-maplibre";
import { getMartinParcelTileUrl } from "../tileUrls";

interface EpaFacilitiesLayerProps {
  visible: boolean;
}

export function EpaFacilitiesLayer({ visible }: EpaFacilitiesLayerProps) {
  return (
    <Source
      id="epa-tiles"
      type="vector"
      tiles={[getMartinParcelTileUrl("epa_facilities")]}
      minzoom={5}
      maxzoom={22}
    >
      <Layer
        id="epa-tiles-circle"
        type="circle"
        source-layer="epa_facilities"
        layout={{ visibility: visible ? "visible" : "none" }}
        paint={{
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["get", "violations_count"],
            0,
            4,
            5,
            7,
            20,
            12,
          ],
          "circle-color": [
            "interpolate",
            ["linear"],
            ["get", "violations_count"],
            0,
            "#22c55e",
            5,
            "#f59e0b",
            20,
            "#ef4444",
          ],
          "circle-opacity": 0.7,
          "circle-stroke-width": 1,
          "circle-stroke-color": "rgba(255,255,255,0.3)",
        }}
      />
    </Source>
  );
}
