"use client";

import { Source, Layer } from "@vis.gl/react-maplibre";
import { getMartinParcelTileUrl } from "../tileUrls";

interface ParcelBoundaryLayerProps {
  visible: boolean;
  dimmed?: boolean;
}

export function ParcelBoundaryLayer({
  visible,
  dimmed = false,
}: ParcelBoundaryLayerProps) {
  return (
    <Source
      id="parcel-tiles"
      type="vector"
      tiles={[getMartinParcelTileUrl("ebr_parcels.1")]}
      minzoom={10}
      maxzoom={22}
    >
      <Layer
        id="parcel-tiles-fill"
        type="fill"
        source-layer="ebr_parcels.1"
        layout={{ visibility: visible ? "visible" : "none" }}
        paint={{
          "fill-color": "#facc15",
          "fill-opacity": dimmed ? 0.02 : 0.06,
          "fill-outline-color": dimmed ? "#a3a3a3" : "#facc15",
        }}
      />
      <Layer
        id="parcel-tiles-line"
        type="line"
        source-layer="ebr_parcels.1"
        layout={{ visibility: visible ? "visible" : "none" }}
        paint={{
          "line-color": dimmed ? "#a3a3a3" : "#facc15",
          "line-width": 1,
          "line-opacity": dimmed ? 0.3 : 0.7,
        }}
      />
    </Source>
  );
}
