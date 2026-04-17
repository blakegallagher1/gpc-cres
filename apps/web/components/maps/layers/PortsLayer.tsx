"use client";

import { Source, Layer } from "@vis.gl/react-maplibre";
import { getPortsProxyTileUrl } from "../tileUrls";

interface PortsLayerProps {
  visible: boolean;
}

/**
 * Ports / intermodal terminals layer. Renders deep-water ports, barge
 * terminals, and intermodal facilities relevant to LA light-industrial and
 * outdoor-storage thesis (Port of New Orleans, Port of Greater Baton Rouge,
 * Port of South Louisiana, St. Bernard, Plaquemines, Port Fourchon).
 *
 * Data source is configured via the PORTS_TILE_ORIGIN env var. Until that is
 * pointed at a real upstream (BTS / USACE / parish freight overlay), the
 * proxy returns 204 and the layer renders nothing.
 */
export function PortsLayer({ visible }: PortsLayerProps) {
  return (
    <Source
      id="ports-tiles"
      type="vector"
      tiles={[getPortsProxyTileUrl()]}
      minzoom={4}
      maxzoom={22}
    >
      <Layer
        id="ports-tiles-fill"
        type="fill"
        source-layer="ports"
        filter={["==", ["geometry-type"], "Polygon"]}
        layout={{ visibility: visible ? "visible" : "none" }}
        paint={{
          "fill-color": "#2a6496",
          "fill-opacity": 0.35,
          "fill-outline-color": "#14324a",
        }}
      />
      <Layer
        id="ports-tiles-circle"
        type="circle"
        source-layer="ports"
        filter={["==", ["geometry-type"], "Point"]}
        layout={{ visibility: visible ? "visible" : "none" }}
        paint={{
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            4,
            3,
            10,
            6,
            14,
            9,
          ],
          "circle-color": "#2a6496",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.5,
          "circle-opacity": 0.9,
        }}
      />
    </Source>
  );
}
