"use client";

import { Source, Layer } from "@vis.gl/react-maplibre";
import { getRailProxyTileUrl } from "../tileUrls";

interface RailLayerProps {
  visible: boolean;
}

/**
 * Freight rail vector tile layer. Renders Class I / short-line track and
 * intermodal yards (KCS, UP, BNSF, CN, NS, CSX plus LA short-lines). Used
 * to evaluate rail-served parcel thesis for industrial development.
 *
 * Data source is configured via the RAIL_TILE_ORIGIN env var. Until that is
 * pointed at a real upstream (FRA national rail network / OSM railway
 * extract), the proxy returns 204 and the layer renders nothing.
 */
export function RailLayer({ visible }: RailLayerProps) {
  return (
    <Source
      id="rail-tiles"
      type="vector"
      tiles={[getRailProxyTileUrl()]}
      minzoom={6}
      maxzoom={22}
    >
      <Layer
        id="rail-tiles-line"
        type="line"
        source-layer="rail"
        filter={["has", "rail_class"]}
        layout={{
          visibility: visible ? "visible" : "none",
          "line-cap": "butt",
          "line-join": "round",
        }}
        paint={{
          "line-color": [
            "match",
            ["get", "rail_class"],
            "class_i",
            "#3a3a3a",
            "short_line",
            "#6b6b6b",
            "industrial",
            "#8a6a3a",
            "#4a4a4a",
          ],
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            6,
            0.6,
            10,
            1.2,
            14,
            2.2,
            18,
            3.5,
          ],
          "line-dasharray": [2, 1.5],
          "line-opacity": 0.8,
        }}
      />
    </Source>
  );
}
