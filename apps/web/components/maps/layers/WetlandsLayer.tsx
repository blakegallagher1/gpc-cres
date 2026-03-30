"use client";

import { Source, Layer } from "@vis.gl/react-maplibre";
import { getMartinParcelTileUrl } from "../tileUrls";

interface WetlandsLayerProps {
  visible: boolean;
}

export function WetlandsLayer({ visible }: WetlandsLayerProps) {
  return (
    <Source
      id="wetlands-tiles"
      type="vector"
      tiles={[getMartinParcelTileUrl("wetlands")]}
      minzoom={5}
      maxzoom={22}
    >
      <Layer
        id="wetlands-tiles-fill"
        type="fill"
        source-layer="wetlands"
        layout={{ visibility: visible ? "visible" : "none" }}
        paint={{
          "fill-color": "rgba(59, 130, 246, 0.3)",
          "fill-outline-color": "rgba(59, 130, 246, 0.5)",
        }}
      />
    </Source>
  );
}
