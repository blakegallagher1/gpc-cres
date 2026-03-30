"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Map,
  NavigationControl,
  ScaleControl,
  AttributionControl,
} from "@vis.gl/react-maplibre";
import { MVTLayer } from "@deck.gl/geo-layers";
import "maplibre-gl/dist/maplibre-gl.css";

import { registerPmtilesProtocol } from "./config/pmtilesProtocol";
import { getZoningFillColor } from "./config/zoningColors";
import { useMapViewState } from "./hooks/useMapViewState";
import { useOverlayState } from "./hooks/useOverlayState";
import { ParcelBoundaryLayer } from "./layers/ParcelBoundaryLayer";
import { ZoningTileLayer } from "./layers/ZoningTileLayer";
import { FloodZoneLayer } from "./layers/FloodZoneLayer";
import { SoilsLayer } from "./layers/SoilsLayer";
import { WetlandsLayer } from "./layers/WetlandsLayer";
import { EpaFacilitiesLayer } from "./layers/EpaFacilitiesLayer";
import { DeckOverlayProvider } from "./layers/DeckOverlayProvider";
import { TerrainControl } from "./controls/TerrainControl";
import {
  getStreetTileUrls,
  getSatelliteTileUrl,
  getZoningProxyTileUrl,
} from "./tileUrls";

// Register PMTiles protocol on module load
registerPmtilesProtocol();

const DARK_BASE_TILES = [
  "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
  "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
  "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
];

interface MapContainerV2Props {
  height?: string;
  className?: string;
}

export function MapContainerV2({
  height = "100%",
  className,
}: MapContainerV2Props) {
  const { viewState, onMove } = useMapViewState();
  const overlays = useOverlayState();
  const [baseLayer, setBaseLayer] = useState<"Streets" | "Satellite" | "Dark">(
    "Satellite"
  );

  // Build deck.gl layers
  const deckLayers = useMemo(() => {
    const layers = [];

    if (overlays.showZoning) {
      layers.push(
        new MVTLayer({
          id: "zoning-deck-mvt",
          data: getZoningProxyTileUrl(),
          minZoom: 10,
          maxZoom: 22,
          getFillColor: (f: any) =>
            getZoningFillColor(f.properties?.zoning_type),
          getLineColor: [80, 80, 80, 60],
          getLineWidth: 1,
          lineWidthMinPixels: 0.5,
          pickable: true,
          autoHighlight: true,
          highlightColor: [255, 255, 255, 60],
          uniqueIdProperty: "parcel_id",
          binary: true,
        })
      );
    }

    return layers;
  }, [overlays.showZoning]);

  // Map style with base layers only
  const mapStyle = useMemo(
    () => ({
      version: 8 as const,
      sources: {
        streets: {
          type: "raster" as const,
          tiles: getStreetTileUrls(),
          tileSize: 256,
          attribution: "OpenStreetMap",
        },
        satellite: {
          type: "raster" as const,
          tiles: [getSatelliteTileUrl()],
          tileSize: 256,
          maxzoom: 19,
          attribution: "Esri",
        },
        "dark-carto": {
          type: "raster" as const,
          tiles: DARK_BASE_TILES,
          tileSize: 256,
          attribution: "CartoDB / OpenStreetMap",
        },
      },
      layers: [
        {
          id: "base-dark",
          type: "raster" as const,
          source: "dark-carto",
          layout: { visibility: "visible" as const },
        },
        {
          id: "base-streets",
          type: "raster" as const,
          source: "streets",
          layout: {
            visibility: (
              baseLayer !== "Satellite" ? "visible" : "none"
            ) as "visible" | "none",
          },
        },
        {
          id: "base-satellite",
          type: "raster" as const,
          source: "satellite",
          layout: {
            visibility: (
              baseLayer === "Satellite" ? "visible" : "none"
            ) as "visible" | "none",
          },
        },
      ],
    }),
    [baseLayer]
  );

  return (
    <div style={{ height, width: "100%" }} className={className}>
      <Map
        {...viewState}
        onMove={onMove}
        mapStyle={mapStyle}
        projection="globe"
        attributionControl={false}
        style={{ width: "100%", height: "100%" }}
      >
        {/* Tile overlay layers */}
        <ParcelBoundaryLayer
          visible={overlays.showParcelBoundaries}
          dimmed={overlays.showZoning}
        />
        <ZoningTileLayer visible={overlays.showZoning} />
        <FloodZoneLayer visible={overlays.showFlood} />
        <SoilsLayer visible={overlays.showSoils} />
        <WetlandsLayer visible={overlays.showWetlands} />
        <EpaFacilitiesLayer visible={overlays.showEpa} />

        {/* deck.gl GPU overlays */}
        <DeckOverlayProvider layers={deckLayers} />

        {/* 3D terrain */}
        <TerrainControl
          enabled={overlays.showTerrain}
          exaggeration={1.5}
        />

        {/* Controls */}
        <NavigationControl position="bottom-right" />
        <ScaleControl position="bottom-left" />
        <AttributionControl position="bottom-right" compact />
      </Map>
    </div>
  );
}
