"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Map,
  NavigationControl,
  ScaleControl,
  AttributionControl,
  useMap,
} from "@vis.gl/react-maplibre";
import { MVTLayer } from "@deck.gl/geo-layers";
import "maplibre-gl/dist/maplibre-gl.css";

import { registerPmtilesProtocol } from "./config/pmtilesProtocol";
import { getZoningFillColor } from "./config/zoningColors";
import { useMapViewState } from "./hooks/useMapViewState";
import { useOverlayState } from "./hooks/useOverlayState";
import { ParcelBoundaryLayer } from "./layers/ParcelBoundaryLayer";
import { ParcelExtrusionLayer } from "./layers/ParcelExtrusionLayer";
import { ZoningTileLayer } from "./layers/ZoningTileLayer";
import { FluTileLayer } from "./layers/FluTileLayer";
import { FloodZoneLayer } from "./layers/FloodZoneLayer";
import { SoilsLayer } from "./layers/SoilsLayer";
import { WetlandsLayer } from "./layers/WetlandsLayer";
import { EpaFacilitiesLayer } from "./layers/EpaFacilitiesLayer";
import { ParcelPointLayer } from "./layers/ParcelPointLayer";
import { DeckOverlayProvider } from "./layers/DeckOverlayProvider";
import { TerrainControl } from "./controls/TerrainControl";
import { useMapPopups } from "./hooks/useMapPopups";
import { useMapSelection } from "./hooks/useMapSelection";
import type { MapParcel } from "./types";
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

type ZoningFeature = {
  properties?: {
    zoning_type?: string | null;
  };
};

interface MapContainerV2Props {
  height?: string;
  className?: string;
  initialCenter?: [number, number];
  initialZoom?: number;
  parcels?: MapParcel[];
  selectedParcelIds?: Set<string>;
  onParcelClick?: (parcelId: string) => void;
  onSelectionChange?: (ids: Set<string>) => void;
  onMapReady?: (map: maplibregl.Map) => void;
}

function MapReadyBridge({ onMapReady }: { onMapReady?: (map: maplibregl.Map) => void }) {
  const { current: map } = useMap();

  useEffect(() => {
    if (!map || !onMapReady) return;
    onMapReady(map.getMap());
  }, [map, onMapReady]);

  return null;
}

function MapInteractionBridge({
  onParcelClick,
  onClusterClick,
}: {
  onParcelClick?: (parcelId: string) => void;
  onClusterClick?: (center: [number, number], zoom: number) => void;
}) {
  const { current: map } = useMap();

  useMapPopups({
    onParcelClick,
    onClusterClick: (center, zoom) => {
      onClusterClick?.(center, zoom);
      map?.flyTo({ center, zoom, essential: true });
    },
  });

  return null;
}

export function MapContainerV2({
  height = "100%",
  className,
  initialCenter,
  initialZoom,
  parcels = [],
  selectedParcelIds = new Set(),
  onParcelClick,
  onSelectionChange,
  onMapReady,
}: MapContainerV2Props) {
  const { viewState, onMove } = useMapViewState(initialCenter, initialZoom);
  const overlays = useOverlayState();
  const { selectedIds, updateSelection } = useMapSelection({
    selectedParcelIds,
    onSelectionChange,
  });
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
          getFillColor: (feature: ZoningFeature) =>
            getZoningFillColor(feature.properties?.zoning_type),
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

  const hasParcels = parcels.length > 0;

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
        <MapReadyBridge onMapReady={onMapReady} />
        <MapInteractionBridge
          onParcelClick={(parcelId) => {
            updateSelection(parcelId, false);
            onParcelClick?.(parcelId);
          }}
          onClusterClick={undefined}
        />
        {/* Tile overlay layers */}
        <ParcelBoundaryLayer
          visible={overlays.showParcelBoundaries}
          dimmed={overlays.showZoning}
        />
        <ZoningTileLayer visible={overlays.showZoning} />
        <FluTileLayer visible={overlays.showFlu} />
        <FloodZoneLayer visible={overlays.showFlood} />
        <SoilsLayer visible={overlays.showSoils} />
        <WetlandsLayer visible={overlays.showWetlands} />
        <EpaFacilitiesLayer visible={overlays.showEpa} />
        <ParcelExtrusionLayer visible={overlays.showTerrain} />
        <ParcelPointLayer
          parcels={parcels}
          visible={hasParcels}
          selectedIds={selectedIds}
        />

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
