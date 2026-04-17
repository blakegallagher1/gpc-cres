"use client";

import { Source, Layer } from "@vis.gl/react-maplibre";
import { getInterchangesProxyTileUrl } from "../tileUrls";

interface InterchangesLayerProps {
  visible: boolean;
}

/**
 * Major interchanges / highway exits vector tile layer. Renders interstate
 * and state-highway interchanges (I-10 / I-12 / I-49 / I-55 / I-59 and
 * primary LA highways) with exit numbers and classification. Powers the
 * last-mile accessibility story for truck parking and light-industrial
 * thesis.
 *
 * Data source is configured via the INTERCHANGES_TILE_ORIGIN env var. Until
 * that is pointed at a real upstream (LA DOTD highway network / OSM
 * motorway_junction extract), the proxy returns 204 and the layer renders
 * nothing.
 */
export function InterchangesLayer({ visible }: InterchangesLayerProps) {
  return (
    <Source
      id="interchanges-tiles"
      type="vector"
      tiles={[getInterchangesProxyTileUrl()]}
      minzoom={7}
      maxzoom={22}
    >
      <Layer
        id="interchanges-tiles-circle"
        type="circle"
        source-layer="interchanges"
        filter={["==", ["geometry-type"], "Point"]}
        layout={{ visibility: visible ? "visible" : "none" }}
        paint={{
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            7,
            2,
            12,
            4,
            16,
            7,
          ],
          "circle-color": [
            "match",
            ["get", "interchange_class"],
            "major",
            "#b54a28",
            "secondary",
            "#d48645",
            "#a0602a",
          ],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.2,
          "circle-opacity": 0.9,
        }}
      />
      <Layer
        id="interchanges-tiles-label"
        type="symbol"
        source-layer="interchanges"
        minzoom={11}
        filter={["==", ["geometry-type"], "Point"]}
        layout={{
          visibility: visible ? "visible" : "none",
          "text-field": ["coalesce", ["get", "exit_number"], ["get", "name"], ""],
          "text-size": 10,
          "text-offset": [0, 1.1],
          "text-anchor": "top",
          "text-allow-overlap": false,
        }}
        paint={{
          "text-color": "#1a1a1a",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.2,
        }}
      />
    </Source>
  );
}
