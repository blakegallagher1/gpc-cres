"use client";

import { Source, Layer } from "@vis.gl/react-maplibre";
import { getMartinParcelTileUrl } from "../tileUrls";

interface FloodZoneLayerProps {
  visible: boolean;
}

export function FloodZoneLayer({ visible }: FloodZoneLayerProps) {
  return (
    <Source
      id="fema-flood-tiles"
      type="vector"
      tiles={[getMartinParcelTileUrl("fema_flood")]}
      minzoom={5}
      maxzoom={22}
    >
      <Layer
        id="fema-flood-tiles-fill"
        type="fill"
        source-layer="fema_flood"
        layout={{ visibility: visible ? "visible" : "none" }}
        paint={{
          "fill-color": [
            "match",
            ["get", "zone"],
            "V",
            "rgba(220, 38, 38, 0.45)",
            "VE",
            "rgba(220, 38, 38, 0.45)",
            "A",
            "rgba(239, 68, 68, 0.35)",
            "AE",
            "rgba(249, 115, 22, 0.35)",
            "AH",
            "rgba(249, 115, 22, 0.35)",
            "AO",
            "rgba(249, 115, 22, 0.35)",
            "X",
            "transparent",
            "OPEN WATER",
            "transparent",
            "rgba(156, 163, 175, 0.15)",
          ],
          "fill-outline-color": [
            "match",
            ["get", "zone"],
            "V",
            "rgba(220, 38, 38, 0.6)",
            "VE",
            "rgba(220, 38, 38, 0.6)",
            "A",
            "rgba(239, 68, 68, 0.5)",
            "AE",
            "rgba(249, 115, 22, 0.5)",
            "AH",
            "rgba(249, 115, 22, 0.5)",
            "AO",
            "rgba(249, 115, 22, 0.5)",
            "transparent",
          ],
        }}
      />
    </Source>
  );
}
