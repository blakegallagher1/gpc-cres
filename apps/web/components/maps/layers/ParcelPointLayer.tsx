"use client";

import { Layer, Source } from "@vis.gl/react-maplibre";
import type { MapParcel } from "../types";

interface ParcelPointLayerProps {
  parcels: MapParcel[];
  visible: boolean;
  selectedIds: Set<string>;
}

function buildPointGeoJson(parcels: MapParcel[], selectedIds: Set<string>): GeoJSON.FeatureCollection<GeoJSON.Point, Record<string, unknown>> {
  return {
    type: "FeatureCollection",
    features: parcels.map((parcel) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [parcel.lng, parcel.lat],
      },
      properties: {
        id: parcel.id,
        address: parcel.address,
        owner: parcel.owner ?? null,
        selected: selectedIds.has(parcel.id),
      },
    })),
  };
}

/**
 * Parcel point source with cluster support for the V2 map surface.
 */
export function ParcelPointLayer({
  parcels,
  visible,
  selectedIds,
}: ParcelPointLayerProps) {
  const data = buildPointGeoJson(parcels, selectedIds);

  return (
    <Source
      id="parcel-point-source"
      type="geojson"
      data={data}
      cluster
      clusterMaxZoom={13}
      clusterRadius={50}
    >
      <Layer
        id="parcel-clusters"
        type="circle"
        filter={["has", "point_count"]}
        layout={{ visibility: visible ? "visible" : "none" }}
        paint={{
          "circle-radius": [
            "step",
            ["get", "point_count"],
            25,
            11,
            35,
            51,
            45,
          ],
          "circle-color": "#1d4ed8",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#dbeafe",
          "circle-opacity": 0.9,
        }}
      />
      <Layer
        id="parcel-cluster-count"
        type="symbol"
        filter={["has", "point_count"]}
        layout={{
          visibility: visible ? "visible" : "none",
          "text-field": "{point_count_abbreviated}",
          "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
          "text-size": 12,
        }}
        paint={{
          "text-color": "#ffffff",
        }}
      />
      <Layer
        id="parcel-points"
        type="circle"
        filter={["!", ["has", "point_count"]]}
        minzoom={11}
        layout={{ visibility: visible ? "visible" : "none" }}
        paint={{
          "circle-radius": 7,
          "circle-color": ["case", ["get", "selected"], "#1d4ed8", "#facc15"],
          "circle-stroke-width": ["case", ["get", "selected"], 3, 2],
          "circle-stroke-color": ["case", ["get", "selected"], "#1e3a8a", "#b45309"],
          "circle-stroke-opacity": 1,
          "circle-opacity": 0.9,
        }}
      />
    </Source>
  );
}
