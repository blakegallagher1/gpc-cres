"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

import { MapContainerV2 } from "./MapContainerV2";
import {
  MapLibreParcelMap,
  type MapLibreParcelMapRef,
} from "./MapLibreParcelMap";
import type {
  MapHudState,
  MapParcel,
  MapTrajectoryData,
  MapTrajectoryVelocityDatum,
} from "./types";
import type { ViewportBounds } from "./useParcelGeometry";

interface MapPageV2Props {
  parcels: MapParcel[];
  center?: [number, number];
  zoom?: number;
  height?: string;
  onParcelClick?: (id: string) => void;
  showLayers?: boolean;
  showTools?: boolean;
  polygon?: number[][][] | null;
  onPolygonDrawn?: (coordinates: number[][][]) => void;
  onPolygonCleared?: () => void;
  trajectoryData?: MapTrajectoryData | null;
  trajectoryVelocityData?: MapTrajectoryVelocityDatum[] | null;
  highlightParcelIds?: Set<string>;
  selectedParcelIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  onViewStateChange?: (
    center: [number, number],
    zoom: number,
    bounds?: ViewportBounds,
  ) => void;
  onMapReady?: () => void;
  onHudStateChange?: (state: MapHudState) => void;
  searchSlot?: React.ReactNode;
  dataFreshnessLabel?: string;
  latencyLabel?: string;
  className?: string;
}

function requiresLegacyMap(props: MapPageV2Props): boolean {
  return Boolean(
    props.polygon ||
      props.onPolygonDrawn ||
      props.onPolygonCleared ||
      props.trajectoryData ||
      props.trajectoryVelocityData ||
      props.showTools ||
      props.searchSlot ||
      props.onHudStateChange ||
      props.dataFreshnessLabel ||
      props.latencyLabel ||
      props.onViewStateChange,
  );
}

const MapPageV2Bridge = forwardRef<MapLibreParcelMapRef, MapPageV2Props>(
  function MapPageV2Bridge(
    {
      parcels,
      height = "100%",
      className,
      selectedParcelIds = new Set(),
      highlightParcelIds,
      onParcelClick,
      onSelectionChange,
      onMapReady,
    }: MapPageV2Props,
    ref,
  ) {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const temporaryLayerIdsRef = useRef<Map<string, string[]>>(new Map());
  const [imperativeHighlights, setImperativeHighlights] = useState<Set<string>>(
    () => new Set(),
  );

  const effectiveSelectedIds = useMemo(() => {
    const merged = new Set(selectedParcelIds);
    if (highlightParcelIds) {
      for (const id of highlightParcelIds) merged.add(id);
    }
    for (const id of imperativeHighlights) merged.add(id);
    return merged;
  }, [highlightParcelIds, imperativeHighlights, selectedParcelIds]);

  const clearTemporaryLayers = useCallback((layerIds?: string[]) => {
    const map = mapRef.current;
    if (!map) return;

    const targets =
      layerIds && layerIds.length > 0
        ? layerIds
        : Array.from(temporaryLayerIdsRef.current.keys());

    for (const layerId of targets) {
      const actualLayerIds = temporaryLayerIdsRef.current.get(layerId) ?? [];

      for (const actualLayerId of actualLayerIds) {
        if (map.getLayer(actualLayerId)) {
          map.removeLayer(actualLayerId);
        }
      }

      if (map.getSource(layerId)) {
        map.removeSource(layerId);
      }

      temporaryLayerIdsRef.current.delete(layerId);
    }
  }, []);

  const addTemporaryLayer = useCallback(
    (
      layerId: string,
      geojson: GeoJSON.FeatureCollection,
      style?: {
        fillColor?: string;
        fillOpacity?: number;
        strokeColor?: string;
        strokeWidth?: number;
      },
    ) => {
      const map = mapRef.current;
      if (!map || !map.isStyleLoaded()) return;

      clearTemporaryLayers([layerId]);

      map.addSource(layerId, {
        type: "geojson",
        data: geojson,
      });

      const actualLayerIds: string[] = [];
      const hasPolygon = geojson.features.some(
        (feature) =>
          feature.geometry?.type === "Polygon" ||
          feature.geometry?.type === "MultiPolygon",
      );
      const hasLine = geojson.features.some(
        (feature) =>
          feature.geometry?.type === "LineString" ||
          feature.geometry?.type === "MultiLineString",
      );
      const hasPoint = geojson.features.some(
        (feature) =>
          feature.geometry?.type === "Point" ||
          feature.geometry?.type === "MultiPoint",
      );

      if (hasPolygon) {
        const fillLayerId = `${layerId}-fill`;
        map.addLayer({
          id: fillLayerId,
          type: "fill",
          source: layerId,
          paint: {
            "fill-color": style?.fillColor ?? "#f97316",
            "fill-opacity": style?.fillOpacity ?? 0.28,
          },
        });
        actualLayerIds.push(fillLayerId);
      }

      if (hasLine || hasPolygon) {
        const lineLayerId = `${layerId}-line`;
        map.addLayer({
          id: lineLayerId,
          type: "line",
          source: layerId,
          paint: {
            "line-color": style?.strokeColor ?? "#fb923c",
            "line-width": style?.strokeWidth ?? 2,
          },
        });
        actualLayerIds.push(lineLayerId);
      }

      if (hasPoint) {
        const circleLayerId = `${layerId}-circle`;
        map.addLayer({
          id: circleLayerId,
          type: "circle",
          source: layerId,
          paint: {
            "circle-radius": 6,
            "circle-color": style?.fillColor ?? "#f97316",
            "circle-stroke-color": style?.strokeColor ?? "#fb923c",
            "circle-stroke-width": 2,
          },
        });
        actualLayerIds.push(circleLayerId);
      }

      temporaryLayerIdsRef.current.set(layerId, actualLayerIds);
    },
    [clearTemporaryLayers],
  );

  const highlightParcels = useCallback(
    (
      parcelIds: string[],
      _style?: "pulse" | "outline" | "fill",
      _color?: string,
      durationMs = 0,
    ) => {
      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current);
        highlightTimerRef.current = null;
      }

      setImperativeHighlights(new Set(parcelIds));

      if (durationMs > 0) {
        highlightTimerRef.current = setTimeout(() => {
          setImperativeHighlights(new Set());
          highlightTimerRef.current = null;
        }, durationMs);
      }
    },
    [],
  );

  useEffect(
    () => () => {
      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current);
      }
      clearTemporaryLayers();
    },
    [clearTemporaryLayers],
  );

  useImperativeHandle(
    ref,
    () => ({
      flyTo: ({ center: nextCenter, zoom: nextZoom }) => {
        mapRef.current?.flyTo({
          center: nextCenter,
          zoom: nextZoom,
          duration: 1500,
        });
      },
      zoomIn: () => {
        mapRef.current?.zoomIn({ duration: 250 });
      },
      zoomOut: () => {
        mapRef.current?.zoomOut({ duration: 250 });
      },
      highlightParcels,
      addTemporaryLayer,
      clearTemporaryLayers,
    }),
    [addTemporaryLayer, clearTemporaryLayers, highlightParcels],
  );

    return (
      <MapContainerV2
        parcels={parcels}
        height={height}
        className={className}
        selectedParcelIds={effectiveSelectedIds}
        onParcelClick={onParcelClick}
        onSelectionChange={onSelectionChange}
        onMapReady={(map) => {
          mapRef.current = map;
          onMapReady?.();
        }}
      />
    );
  },
);

export const MapPageV2 = forwardRef<MapLibreParcelMapRef, MapPageV2Props>(
  function MapPageV2(props, ref) {
    if (requiresLegacyMap(props)) {
      return (
        <MapLibreParcelMap
          ref={ref}
          parcels={props.parcels}
          center={props.center}
          zoom={props.zoom}
          height={props.height}
          onParcelClick={props.onParcelClick}
          showLayers={props.showLayers}
          showTools={props.showTools}
          polygon={props.polygon}
          onPolygonDrawn={props.onPolygonDrawn}
          onPolygonCleared={props.onPolygonCleared}
          trajectoryData={props.trajectoryData}
          trajectoryVelocityData={props.trajectoryVelocityData}
          highlightParcelIds={props.highlightParcelIds}
          selectedParcelIds={props.selectedParcelIds}
          onSelectionChange={props.onSelectionChange}
          onViewStateChange={props.onViewStateChange}
          onMapReady={props.onMapReady}
          onHudStateChange={props.onHudStateChange}
          searchSlot={props.searchSlot}
          dataFreshnessLabel={props.dataFreshnessLabel}
          latencyLabel={props.latencyLabel}
        />
      );
    }

    return <MapPageV2Bridge {...props} ref={ref} />;
  },
);
