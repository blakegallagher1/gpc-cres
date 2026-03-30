"use client";

import { Source, Layer } from "@vis.gl/react-maplibre";
import { getZoningProxyTileUrl } from "../tileUrls";
import { buildZoningTileColorExpression } from "../zoningLayerConfig";

interface ZoningTileLayerProps {
  visible: boolean;
}

/**
 * Native MapLibre vector tile layer for zoning fills.
 * Uses the same-origin proxy at /api/map/zoning-tiles/.
 * Will be replaced by deck.gl MVTLayer in Phase 4.
 */
export function ZoningTileLayer({ visible }: ZoningTileLayerProps) {
  return (
    <Source
      id="zoning-tiles"
      type="vector"
      tiles={[getZoningProxyTileUrl()]}
      minzoom={10}
      maxzoom={22}
    >
      <Layer
        id="zoning-tiles-fill"
        type="fill"
        source-layer="parcels"
        filter={["has", "zoning_type"]}
        layout={{ visibility: visible ? "visible" : "none" }}
        paint={{
          "fill-color": buildZoningTileColorExpression("zoning_type") as any,
          "fill-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            0.55,
            13,
            0.45,
            16,
            0.35,
            22,
            0.25,
          ],
          "fill-outline-color": buildZoningTileColorExpression(
            "zoning_type"
          ) as any,
        }}
      />
    </Source>
  );
}
