"use client";

import { Source, Layer } from "@vis.gl/react-maplibre";
import { getFluProxyTileUrl } from "../tileUrls";

interface FluTileLayerProps {
  visible: boolean;
}

/**
 * Future Land Use (FLU) vector tile layer. Renders per-parish FLU designations
 * distinct from current zoning so operators can identify upzone-ready parcels.
 *
 * Data source is configured via the FLU_TILE_ORIGIN env var. Until that is
 * pointed at a real upstream (parish GIS portal), the proxy returns 404 and
 * the layer renders nothing — the toggle still works so the UX is ready for
 * data availability.
 */
export function FluTileLayer({ visible }: FluTileLayerProps) {
  return (
    <Source
      id="flu-tiles"
      type="vector"
      tiles={[getFluProxyTileUrl()]}
      minzoom={10}
      maxzoom={22}
    >
      <Layer
        id="flu-tiles-fill"
        type="fill"
        source-layer="flu"
        filter={["has", "flu_category"]}
        layout={{ visibility: visible ? "visible" : "none" }}
        paint={{
          "fill-color": [
            "match",
            ["get", "flu_category"],
            "residential",
            "#d97a9a",
            "commercial",
            "#f0ad4e",
            "industrial",
            "#9b6b4b",
            "mixed_use",
            "#7b95c6",
            "public",
            "#6fa87a",
            "open_space",
            "#7cc69a",
            "agriculture",
            "#c7b68c",
            "#9a9a9a",
          ],
          "fill-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            0.5,
            14,
            0.35,
            18,
            0.25,
          ],
          "fill-outline-color": "#2a2a2a",
        }}
      />
      <Layer
        id="flu-tiles-line"
        type="line"
        source-layer="flu"
        filter={["has", "flu_category"]}
        layout={{ visibility: visible ? "visible" : "none" }}
        paint={{
          "line-color": "#1a1a1a",
          "line-width": 0.5,
          "line-opacity": 0.4,
        }}
      />
    </Source>
  );
}
