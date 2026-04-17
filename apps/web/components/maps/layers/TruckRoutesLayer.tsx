"use client";

import { Source, Layer } from "@vis.gl/react-maplibre";
import { getTruckRoutesProxyTileUrl } from "../tileUrls";

interface TruckRoutesLayerProps {
  visible: boolean;
}

/**
 * Truck routes vector tile layer. Renders designated truck corridors and
 * freight routes (state-DOT classifications) so operators can evaluate
 * last-mile access for light-industrial / trucking-adjacent parcels.
 *
 * Data source is configured via the TRUCK_ROUTES_TILE_ORIGIN env var. Until
 * that is pointed at a real upstream (LA DOTD / MPO freight plan source),
 * the proxy returns 204 and the layer renders nothing — the toggle still
 * works so the UX is ready for data availability.
 */
export function TruckRoutesLayer({ visible }: TruckRoutesLayerProps) {
  return (
    <Source
      id="truck-routes-tiles"
      type="vector"
      tiles={[getTruckRoutesProxyTileUrl()]}
      minzoom={6}
      maxzoom={22}
    >
      <Layer
        id="truck-routes-tiles-line"
        type="line"
        source-layer="truck_routes"
        filter={["has", "route_class"]}
        layout={{
          visibility: visible ? "visible" : "none",
          "line-cap": "round",
          "line-join": "round",
        }}
        paint={{
          "line-color": [
            "match",
            ["get", "route_class"],
            "interstate",
            "#d14b3b",
            "primary",
            "#e27a3f",
            "secondary",
            "#f2b04e",
            "local",
            "#8a8a8a",
            "#c06a3a",
          ],
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            6,
            0.8,
            10,
            1.6,
            14,
            2.8,
            18,
            4.5,
          ],
          "line-opacity": 0.85,
        }}
      />
    </Source>
  );
}
