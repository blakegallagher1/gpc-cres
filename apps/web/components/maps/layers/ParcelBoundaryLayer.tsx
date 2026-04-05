"use client";

import { Source, Layer } from "@vis.gl/react-maplibre";
import { getMartinParcelTileUrl } from "../tileUrls";
import {
  ParcelColorMode,
  getParcelFillColor,
  getParcelFillOpacity,
  getParcelLineColor,
  getParcelLineWidth,
  getParcelLineOpacity,
} from "../parcelColorExpressions";

interface ParcelBoundaryLayerProps {
  visible: boolean;
  dimmed?: boolean;
  colorMode?: ParcelColorMode;
}

export function ParcelBoundaryLayer({
  visible,
  dimmed = false,
  colorMode = "zoning",
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
          "fill-color": dimmed ? "#a3a3a3" : getParcelFillColor(colorMode),
          "fill-opacity": dimmed ? 0.02 : getParcelFillOpacity(),
          "fill-outline-color": dimmed ? "#a3a3a3" : getParcelLineColor(colorMode),
        }}
      />
      <Layer
        id="parcel-tiles-line"
        type="line"
        source-layer="ebr_parcels.1"
        layout={{ visibility: visible ? "visible" : "none" }}
        paint={{
          "line-color": dimmed ? "#a3a3a3" : getParcelLineColor(colorMode),
          "line-width": dimmed ? 1 : getParcelLineWidth(),
          "line-opacity": dimmed ? 0.3 : getParcelLineOpacity(),
        }}
      />
    </Source>
  );
}
