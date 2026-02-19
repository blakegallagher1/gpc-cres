"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { useParcelGeometry, type ViewportBounds } from "./useParcelGeometry";
import { getStreetTileUrls, getSatelliteTileUrl } from "./tileUrls";
import {
  STATUS_COLORS,
  DEFAULT_STATUS_COLOR,
  getZoningColor,
  getFloodColor,
} from "./mapStyles";
import { useStableOptions } from "@/lib/hooks/useStableOptions";
import type { MapParcel } from "./ParcelMap";

type ParcelFeatureProperties = {
  id: string;
  address: string;
  dealName?: string;
  dealStatus?: string;
  acreage?: number | null;
  floodZone?: string | null;
  currentZoning?: string | null;
  selected: boolean;
  fillColor: string;
  strokeColor: string;
};

type CompSale = {
  id: string;
  address: string;
  lat: number;
  lng: number;
  salePrice: number | null;
  saleDate: string | null;
  acreage: number | null;
  pricePerAcre: number | null;
  pricePerSf: number | null;
  useType: string | null;
};

type HeatPointProperties = {
  intensity: number;
  address: string;
};

type IsochroneResult = {
  polygon: [number, number][];
  center: [number, number];
  minutes: number;
  parcelCount: number;
};

interface MapLibreParcelMapProps {
  parcels: MapParcel[];
  center?: [number, number];
  zoom?: number;
  height?: string;
  onParcelClick?: (id: string) => void;
  showLayers?: boolean;
  showTools?: boolean;
}

const ZOOM_LIMIT = 19;

function getSavedBaseLayer(): string {
  try {
    return localStorage.getItem("map-base-layer") || "Streets";
  } catch {
    return "Streets";
  }
}

function getSavedOverlays(): Record<string, boolean> {
  try {
    const saved = localStorage.getItem("map-overlay-prefs");
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
}

function getSavedOverlaysFallback(): {
  parcelBoundaries: boolean;
  zoning: boolean;
  flood: boolean;
} {
  const saved = getSavedOverlays();
  return {
    parcelBoundaries: saved["Parcel Boundaries"] !== false,
    zoning: saved["Zoning Overlay"] === true,
    flood: saved["Flood Zones"] === true,
  };
}

function statusColorForParcel(parcel: MapParcel): string {
  return STATUS_COLORS[parcel.dealStatus || ""] || DEFAULT_STATUS_COLOR;
}

function formatDistance(meters: number): string {
  const feet = meters * 3.28084;
  if (feet < 5280) return `${Math.round(feet).toLocaleString()} ft`;
  const miles = feet / 5280;
  return `${miles.toFixed(2)} mi`;
}

function formatArea(sqMeters: number): string {
  const sqFeet = sqMeters * 10.7639;
  if (sqFeet < 43560) return `${Math.round(sqFeet).toLocaleString()} sq ft`;
  const acres = sqFeet / 43560;
  return `${acres.toFixed(2)} acres`;
}

function formatCurrency(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function formatCompLabel(comp: CompSale): string {
  if (comp.pricePerSf != null && Number.isFinite(comp.pricePerSf)) {
    return `$${comp.pricePerSf.toFixed(2)}/SF`;
  }
  if (comp.salePrice != null) {
    return formatCurrency(comp.salePrice);
  }
  return "";
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getRecencyColor(saleDate: string | null): string {
  if (!saleDate) return "#9ca3af";
  const months = monthsAgo(saleDate);
  if (months <= 6) return "#22c55e";
  if (months <= 12) return "#eab308";
  if (months <= 24) return "#f97316";
  return "#9ca3af";
}

function getRecencyLabel(saleDate: string | null): string {
  if (!saleDate) return "Unknown date";
  const months = monthsAgo(saleDate);
  if (months <= 6) return "< 6 months";
  if (months <= 12) return "6-12 months";
  if (months <= 24) return "12-24 months";
  return "> 24 months";
}

function monthsAgo(dateStr: string): number {
  const date = new Date(dateStr);
  const now = new Date();
  return (now.getFullYear() - date.getFullYear()) * 12 + (now.getMonth() - date.getMonth());
}

function haversineDistanceMeters(a: { lng: number; lat: number }, b: { lng: number; lat: number }) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;

  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return R * c;
}

function polygonAreaSquareMeters(points: maplibregl.LngLat[]): number {
  if (points.length < 3) return 0;

  const radians = points.map((p) => ({
    x: p.lng * Math.PI / 180,
    y: p.lat * Math.PI / 180,
  }));

  let area = 0;
  for (let i = 0; i < radians.length; i++) {
    const j = (i + 1) % radians.length;
    area += radians[j].x * radians[i].y - radians[i].x * radians[j].y;
  }

  const avgLat = radians.reduce((sum, p) => sum + p.y, 0) / radians.length;
  return Math.abs(area) * 6371000 * 6371000 * Math.cos(avgLat) / 2;
}

function isPointInPolygon(point: [number, number], polygon: [number, number][]): boolean {
  let inside = false;
  const [px, py] = point;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];

    const intersect =
      yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }

  return inside;
}

function isPolygonGeometry(
  value: unknown
): value is GeoJSON.Polygon | GeoJSON.MultiPolygon {
  if (!value || typeof value !== "object") return false;
  const geometry = value as { type?: unknown; coordinates?: unknown };
  return (
    geometry.type === "Polygon" ||
    geometry.type === "MultiPolygon"
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parcelPopupHtml(parcel: MapParcel): string {
  const safeAddress = escapeHtml(parcel.address);
  const safeDealName = parcel.dealName ? escapeHtml(parcel.dealName) : null;
  const safeDealStatus = parcel.dealStatus ? escapeHtml(parcel.dealStatus.replace(/_/g, " ")) : null;
  const safeZoning = parcel.currentZoning ? escapeHtml(parcel.currentZoning) : null;
  const safeFloodZone = parcel.floodZone ? escapeHtml(parcel.floodZone) : null;

  const rows = [
    `<div style="font-weight:600;margin-bottom:2px;">${safeAddress}</div>`,
    safeDealName
      ? `<div style="color:#6b7280;font-size:11px;">${safeDealName}</div>`
      : "",
    parcel.acreage != null
      ? `<div style=\"font-size:11px;\">${Number(parcel.acreage).toFixed(2)} acres</div>`
      : "",
    safeDealStatus
      ? `<div style=\"font-size:11px;\">Status: ${safeDealStatus}</div>`
      : "",
    safeZoning
      ? `<div style=\"font-size:11px;\">Zoning: ${safeZoning}</div>`
      : "",
    safeFloodZone
      ? `<div style=\"font-size:11px;\">Flood: ${safeFloodZone}</div>`
      : "",
  ].filter(Boolean);

  return `<div style="font-size:13px;line-height:1.4">${rows.join("")}</div>`;
}

export function MapLibreParcelMap({
  parcels,
  center = [30.4515, -91.1871],
  zoom = 11,
  height = "400px",
  onParcelClick,
  showLayers = true,
  showTools = false,
}: MapLibreParcelMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const fittedBoundsRef = useRef("");
  const [mapError, setMapError] = useState<string | null>(null);

  const [baseLayer, setBaseLayer] = useState<string>(() => getSavedBaseLayer());
  const [showParcelBoundaries, setShowParcelBoundaries] = useState<boolean>(() => getSavedOverlaysFallback().parcelBoundaries);
  const [showZoning, setShowZoning] = useState<boolean>(() => getSavedOverlaysFallback().zoning);
  const [showFlood, setShowFlood] = useState<boolean>(() => getSavedOverlaysFallback().flood);
  const [showComps, setShowComps] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showIsochrone, setShowIsochrone] = useState(false);
  const [measureMode, setMeasureMode] = useState<"off" | "distance" | "area">("off");
  const [selectedParcelIds, setSelectedParcelIds] = useState<Set<string>>(new Set());
  const [viewportBounds, setViewportBounds] = useState<ViewportBounds | null>(null);
  const boundsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stableMapCallbacks = useStableOptions({ onParcelClick });
  const parcelByIdRef = useRef<Map<string, MapParcel>>(new Map());

  const parcelById = useMemo(() => {
    const map = new Map<string, MapParcel>();
    for (const parcel of parcels) {
      map.set(parcel.id, parcel);
    }
    return map;
  }, [parcels]);

  const mapCenterParcel = useMemo(() => {
    if (parcels.length === 0) return null;
    const avgLat = parcels.reduce((sum, parcel) => sum + parcel.lat, 0) / parcels.length;
    const avgLng = parcels.reduce((sum, parcel) => sum + parcel.lng, 0) / parcels.length;
    return { lat: avgLat, lng: avgLng };
  }, [parcels]);

  const { geometries } = useParcelGeometry(parcels, 200, viewportBounds);

  useEffect(() => {
    parcelByIdRef.current = parcelById;
  }, [parcelById]);

  const mapCenter: [number, number] = [center[1], center[0]];

  const boundarySource = useMemo(() => {
    const features = parcels
      .map((parcel) => {
        const geometry = geometries.get(parcel.id)?.geometry;
        if (!isPolygonGeometry(geometry)) return null;

        const color = statusColorForParcel(parcel);
        const isSelected = selectedParcelIds.has(parcel.id);

        return {
          type: "Feature" as const,
          geometry: geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon,
          properties: {
            id: parcel.id,
            address: parcel.address,
            dealName: parcel.dealName,
            dealStatus: parcel.dealStatus,
            acreage: parcel.acreage ?? null,
            floodZone: parcel.floodZone,
            currentZoning: parcel.currentZoning,
            selected: isSelected,
            fillColor: color,
            strokeColor: color,
          } satisfies ParcelFeatureProperties,
        };
      })
      .filter(Boolean) as GeoJSON.Feature<
      GeoJSON.Polygon | GeoJSON.MultiPolygon,
      ParcelFeatureProperties
    >[];

    return {
      type: "FeatureCollection" as const,
      features,
    } as GeoJSON.FeatureCollection<
      GeoJSON.Polygon | GeoJSON.MultiPolygon,
      ParcelFeatureProperties
    >;
  }, [parcels, geometries, selectedParcelIds]);

  const zoningSource = useMemo(() => {
    const features = parcels
      .filter((parcel) => isPolygonGeometry(geometries.get(parcel.id)?.geometry) && Boolean(parcel.currentZoning))
      .map((parcel) => {
        const geometry = geometries.get(parcel.id)?.geometry;
        if (!isPolygonGeometry(geometry)) return null;

        return {
          type: "Feature" as const,
          geometry: geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon,
          properties: {
            id: parcel.id,
            address: parcel.address,
            dealName: parcel.dealName,
            dealStatus: parcel.dealStatus,
            acreage: parcel.acreage ?? null,
            floodZone: parcel.floodZone,
            currentZoning: parcel.currentZoning,
            selected: selectedParcelIds.has(parcel.id),
            fillColor: getZoningColor(parcel.currentZoning),
            strokeColor: getZoningColor(parcel.currentZoning),
          } satisfies ParcelFeatureProperties,
        };
      })
      .filter(Boolean) as GeoJSON.Feature<
      GeoJSON.Polygon | GeoJSON.MultiPolygon,
      ParcelFeatureProperties
    >[];

    return {
      type: "FeatureCollection" as const,
      features,
    } as GeoJSON.FeatureCollection<
      GeoJSON.Polygon | GeoJSON.MultiPolygon,
      ParcelFeatureProperties
    >;
  }, [parcels, geometries, selectedParcelIds]);

  const floodSource = useMemo(() => {
    const features = parcels
      .filter((parcel) => {
        const geometry = geometries.get(parcel.id)?.geometry;
        return isPolygonGeometry(geometry) && parcel.floodZone != null && getFloodColor(parcel.floodZone) !== "transparent";
      })
      .map((parcel) => {
        const geometry = geometries.get(parcel.id)?.geometry;
        if (!isPolygonGeometry(geometry)) return null;
        const color = getFloodColor(parcel.floodZone ?? null);

        return {
          type: "Feature" as const,
          geometry: geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon,
          properties: {
            id: parcel.id,
            address: parcel.address,
            dealName: parcel.dealName,
            dealStatus: parcel.dealStatus,
            acreage: parcel.acreage ?? null,
            floodZone: parcel.floodZone,
            currentZoning: parcel.currentZoning,
            selected: selectedParcelIds.has(parcel.id),
            fillColor: color,
            strokeColor: color,
          } satisfies ParcelFeatureProperties,
        };
      })
      .filter(Boolean) as GeoJSON.Feature<
      GeoJSON.Polygon | GeoJSON.MultiPolygon,
      ParcelFeatureProperties
    >[];

    return {
      type: "FeatureCollection" as const,
      features,
    } as GeoJSON.FeatureCollection<
      GeoJSON.Polygon | GeoJSON.MultiPolygon,
      ParcelFeatureProperties
    >;
  }, [parcels, geometries, selectedParcelIds]);

  const pointSource = useMemo(() => {
    const features = parcels
      .filter((parcel) => !geometries.has(parcel.id))
      .map((parcel) => {
        const color = statusColorForParcel(parcel);
        const isSelected = selectedParcelIds.has(parcel.id);

        return {
          type: "Feature" as const,
          geometry: {
            type: "Point",
            coordinates: [parcel.lng, parcel.lat],
          },
          properties: {
            id: parcel.id,
            address: parcel.address,
            dealName: parcel.dealName,
            dealStatus: parcel.dealStatus,
            acreage: parcel.acreage ?? null,
            floodZone: parcel.floodZone,
            currentZoning: parcel.currentZoning,
            selected: isSelected,
            fillColor: color,
            strokeColor: color,
          } satisfies ParcelFeatureProperties,
        };
      })
      .filter(Boolean) as GeoJSON.Feature<
      GeoJSON.Point,
      ParcelFeatureProperties
    >[];

    return {
      type: "FeatureCollection" as const,
      features,
    } as GeoJSON.FeatureCollection<
      GeoJSON.Point,
      ParcelFeatureProperties
    >;
  }, [parcels, geometries, selectedParcelIds]);

  const fitBounds = () => {
    const map = mapRef.current;
    if (!map || parcels.length === 0) return;

    const fitKey = parcels
      .map((parcel) => `${parcel.id}:${parcel.lat}:${parcel.lng}`)
      .join("|");
    if (fitKey === fittedBoundsRef.current) return;

    const bounds = new maplibregl.LngLatBounds();
    for (const parcel of parcels) {
      bounds.extend([parcel.lng, parcel.lat]);
    }

    if (bounds.isEmpty()) return;
    map.fitBounds(bounds, { padding: 40, maxZoom: 15, animate: false });
    fittedBoundsRef.current = fitKey;
  };

  useEffect(() => {
    if (mapRef.current || !mapContainerRef.current) return;

    let disposed = false;
    try {
      const map = new maplibregl.Map({
        container: mapContainerRef.current,
        center: mapCenter,
        zoom,
        style: {
          version: 8,
          sources: {
            streets: {
              type: "raster",
              tiles: getStreetTileUrls(),
              tileSize: 256,
              attribution: "OpenStreetMap",
            },
            satellite: {
              type: "raster",
              tiles: [getSatelliteTileUrl()],
              tileSize: 256,
              maxzoom: ZOOM_LIMIT,
              attribution: "Esri",
            },
            "parcel-boundary-source": {
              type: "geojson",
              data: boundarySource,
            },
            "parcel-zoning-source": {
              type: "geojson",
              data: zoningSource,
            },
            "parcel-flood-source": {
              type: "geojson",
              data: floodSource,
            },
            "parcel-point-source": {
              type: "geojson",
              data: pointSource,
            },
          },
          layers: [
            {
              id: "base-streets",
              type: "raster",
              source: "streets",
              layout: {
                visibility: baseLayer === "Satellite" ? "none" : "visible",
              },
            },
            {
              id: "base-satellite",
              type: "raster",
              source: "satellite",
              layout: {
                visibility: baseLayer === "Satellite" ? "visible" : "none",
              },
            },
            {
              id: "parcels-zoning-layer",
              type: "fill",
              source: "parcel-zoning-source",
              layout: {
                visibility: showLayers && showZoning ? "visible" : "none",
              },
              paint: {
                "fill-color": ["get", "fillColor"],
                "fill-opacity": 0.22,
              },
            },
            {
              id: "parcels-flood-layer",
              type: "fill",
              source: "parcel-flood-source",
              layout: {
                visibility: showLayers && showFlood ? "visible" : "none",
              },
              paint: {
                "fill-color": ["get", "fillColor"],
                "fill-opacity": ["case", ["==", ["get", "selected"], true], 0.4, 0.2],
              },
            },
            {
              id: "parcels-boundary-fill",
              type: "fill",
              source: "parcel-boundary-source",
              layout: {
                visibility: showLayers && showParcelBoundaries ? "visible" : "none",
              },
              paint: {
                "fill-color": ["get", "fillColor"],
                "fill-opacity": ["case", ["get", "selected"], 0.18, 0.1],
              },
            },
            {
              id: "parcels-boundary-line",
              type: "line",
              source: "parcel-boundary-source",
              layout: {
                visibility: showLayers && showParcelBoundaries ? "visible" : "none",
              },
              paint: {
                "line-color": ["case", ["get", "selected"], "#000000", ["get", "strokeColor"]],
                "line-width": ["case", ["get", "selected"], 3, 2],
                "line-opacity": ["case", ["get", "selected"], 1, 0.8],
              },
            },
            {
              id: "parcel-points",
              type: "circle",
              source: "parcel-point-source",
              layout: {
                visibility: showLayers ? "visible" : "none",
              },
              paint: {
                "circle-radius": 7,
                "circle-color": ["case", ["get", "selected"], "#1d4ed8", ["get", "fillColor"]],
                "circle-stroke-width": ["case", ["get", "selected"], 3, 2],
                "circle-stroke-color": ["case", ["get", "selected"], "#1e3a8a", ["get", "strokeColor"]],
                "circle-stroke-opacity": 1,
                "circle-opacity": 0.9,
              },
            },
          ],
        },
      });

      mapRef.current = map;

      map.on("load", () => {
        if (disposed) return;

        map.resize();
        setMapReady(true);

        const hideBoundaryLayerVisibility = () => {
          try {
            map.setLayoutProperty(
              "parcels-boundary-fill",
              "visibility",
              showLayers && showParcelBoundaries ? "visible" : "none"
            );
            map.setLayoutProperty(
              "parcels-boundary-line",
              "visibility",
              showLayers && showParcelBoundaries ? "visible" : "none"
            );
            map.setLayoutProperty(
              "parcels-zoning-layer",
              "visibility",
              showLayers && showZoning ? "visible" : "none"
            );
            map.setLayoutProperty(
              "parcels-flood-layer",
              "visibility",
              showLayers && showFlood ? "visible" : "none"
            );
            map.setLayoutProperty("base-streets", "visibility", baseLayer === "Satellite" ? "none" : "visible");
            map.setLayoutProperty("base-satellite", "visibility", baseLayer === "Satellite" ? "visible" : "none");
          } catch {}
        };

        hideBoundaryLayerVisibility();
        fitBounds();

        const handleFeatureClick = (e: maplibregl.MapLayerMouseEvent) => {
          const feature = e.features?.[0];
          const parcelId = feature?.properties?.id as string | undefined;
          if (!parcelId) return;

          const isMultiSelect = e.originalEvent?.ctrlKey || e.originalEvent?.metaKey;
          requestAnimationFrame(() => {
            setSelectedParcelIds((prev) => {
              const next = new Set(prev);
              if (isMultiSelect) {
                if (next.has(parcelId)) next.delete(parcelId);
                else next.add(parcelId);
              } else {
                next.clear();
                next.add(parcelId);
              }
              return next;
            });
          });

          stableMapCallbacks.onParcelClick?.(parcelId);

          const parcel = parcelByIdRef.current.get(parcelId);
          if (parcel && mapRef.current) {
            popupRef.current?.remove();
            popupRef.current = new maplibregl.Popup({ closeOnClick: true })
              .setLngLat([e.lngLat.lng, e.lngLat.lat])
              .setHTML(parcelPopupHtml(parcel))
              .addTo(mapRef.current);
          }
        };

        const clearHoverCursor = () => {
          const container = map.getCanvas();
          if (!container) return;
          container.style.cursor = "";
        };

        map.on("click", "parcels-boundary-line", handleFeatureClick);
        map.on("click", "parcels-boundary-fill", handleFeatureClick);
        map.on("click", "parcel-points", handleFeatureClick);
        map.on("mouseenter", "parcels-boundary-line", () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseenter", "parcels-boundary-fill", () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseenter", "parcel-points", () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "parcels-boundary-line", clearHoverCursor);
        map.on("mouseleave", "parcels-boundary-fill", clearHoverCursor);
        map.on("mouseleave", "parcel-points", clearHoverCursor);

        map.on("moveend", () => {
          fitBounds();
          // Debounced viewport bounds update for geometry loading
          if (boundsTimerRef.current) clearTimeout(boundsTimerRef.current);
          boundsTimerRef.current = setTimeout(() => {
            const b = map.getBounds();
            setViewportBounds({
              west: b.getWest(),
              south: b.getSouth(),
              east: b.getEast(),
              north: b.getNorth(),
            });
          }, 300);
        });
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to initialize MapLibre map";
      setMapError(message);
      return;
    }

    return () => {
      disposed = true;
      if (boundsTimerRef.current) clearTimeout(boundsTimerRef.current);
      if (mapRef.current) {
        popupRef.current?.remove();
        popupRef.current = null;
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    const map = mapRef.current;

    const boundaryLayer = map.getSource("parcel-boundary-source") as
      | { setData: (data: GeoJSON.FeatureCollection) => void }
      | undefined;
    const zoningLayer = map.getSource("parcel-zoning-source") as
      | { setData: (data: GeoJSON.FeatureCollection) => void }
      | undefined;
    const floodLayer = map.getSource("parcel-flood-source") as
      | { setData: (data: GeoJSON.FeatureCollection) => void }
      | undefined;
    const pointLayer = map.getSource("parcel-point-source") as
      | { setData: (data: GeoJSON.FeatureCollection) => void }
      | undefined;

    boundaryLayer?.setData(boundarySource);
    zoningLayer?.setData(zoningSource);
    floodLayer?.setData(floodSource);
    pointLayer?.setData(pointSource);

    try {
      map.setLayoutProperty("parcels-boundary-fill", "visibility", showLayers && showParcelBoundaries ? "visible" : "none");
      map.setLayoutProperty("parcels-boundary-line", "visibility", showLayers && showParcelBoundaries ? "visible" : "none");
      map.setLayoutProperty("parcels-zoning-layer", "visibility", showLayers && showZoning ? "visible" : "none");
      map.setLayoutProperty("parcels-flood-layer", "visibility", showLayers && showFlood ? "visible" : "none");
      map.setLayoutProperty("base-streets", "visibility", baseLayer === "Satellite" ? "none" : "visible");
      map.setLayoutProperty("base-satellite", "visibility", baseLayer === "Satellite" ? "visible" : "none");
      map.setLayoutProperty("parcel-points", "visibility", showLayers ? "visible" : "none");
    } catch {}
  }, [
    boundarySource,
    zoningSource,
    floodSource,
    pointSource,
    mapReady,
    showLayers,
    showParcelBoundaries,
    showZoning,
    showFlood,
    baseLayer,
    selectedParcelIds,
  ]);

  useEffect(() => {
    if (mapReady) {
      fitBounds();
    }
  }, [mapReady, parcels]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    try {
      localStorage.setItem("map-base-layer", baseLayer);
      localStorage.setItem(
        "map-overlay-prefs",
        JSON.stringify({
          "Parcel Boundaries": showParcelBoundaries,
          "Zoning Overlay": showZoning,
          "Flood Zones": showFlood,
        })
      );
    } catch {}
  }, [baseLayer, showParcelBoundaries, showZoning, showFlood, mapReady]);

  if (mapError) {
    return (
      <div
        className="flex h-full w-full items-center justify-center rounded-lg border bg-red-50 text-sm text-red-700"
        style={{ height }}
      >
        <div className="text-center">
          <p className="font-semibold">MapLibre failed to initialize</p>
          <p className="text-xs text-red-600">{mapError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full rounded-lg border">
      <div ref={mapContainerRef} style={{ height, width: "100%" }} />
      {showLayers && (
        <div
          className="absolute left-2 top-2 z-10 rounded-lg bg-white/95 p-2 text-xs shadow-lg"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="mb-2 text-[11px] font-semibold text-gray-600 uppercase">
            MapLibre Layers
          </div>
          <div className="mb-1.5">
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={showParcelBoundaries}
                onChange={(event) => setShowParcelBoundaries(event.target.checked)}
              />
              <span>Parcel Boundaries</span>
            </label>
          </div>
          <div className="mb-1.5">
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={showZoning}
                onChange={(event) => setShowZoning(event.target.checked)}
              />
              <span>Zoning Overlay</span>
            </label>
          </div>
          <div className="mb-1.5">
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={showFlood}
                onChange={(event) => setShowFlood(event.target.checked)}
              />
              <span>Flood Zones</span>
            </label>
          </div>
          <div className="mb-1.5 border-t border-gray-200 pt-1.5 text-[10px] text-gray-500">
            Base layer
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setBaseLayer("Streets")}
              className={`rounded px-2 py-1 ${baseLayer === "Streets" ? "bg-blue-600 text-white" : "bg-gray-100"}`}
            >
              Streets
            </button>
            <button
              type="button"
              onClick={() => setBaseLayer("Satellite")}
              className={`rounded px-2 py-1 ${baseLayer === "Satellite" ? "bg-blue-600 text-white" : "bg-gray-100"}`}
            >
              Satellite
            </button>
          </div>
          <div className="mt-2 text-[10px] text-gray-500">
            Selected: {selectedParcelIds.size}
          </div>
        </div>
      )}
      {showTools && (
        <>
          <MapLibreAnalyticalToolbar
            showComps={showComps}
            setShowComps={setShowComps}
            showHeatmap={showHeatmap}
            setShowHeatmap={setShowHeatmap}
            showIsochrone={showIsochrone}
            setShowIsochrone={setShowIsochrone}
            measureMode={measureMode}
            setMeasureMode={setMeasureMode}
          />
          <MapLibreMeasureTool
            map={mapRef.current}
            mode={measureMode}
            setMode={setMeasureMode}
          />
          <MapLibreCompSaleLayer
            map={mapRef.current}
            parcelsCount={parcels.length}
            visible={showComps}
            centerLat={mapCenterParcel?.lat}
            centerLng={mapCenterParcel?.lng}
          />
          <MapLibreHeatmapLayer
            map={mapRef.current}
            parcels={parcels}
            visible={showHeatmap}
          />
          <MapLibreIsochroneControl
            map={mapRef.current}
            parcels={parcels}
            visible={showIsochrone}
          />
        </>
      )}
    </div>
  );
}

interface MapLibreAnalyticalToolbarProps {
  showComps: boolean;
  setShowComps: (value: boolean | ((value: boolean) => boolean)) => void;
  showHeatmap: boolean;
  setShowHeatmap: (value: boolean | ((value: boolean) => boolean)) => void;
  showIsochrone: boolean;
  setShowIsochrone: (value: boolean | ((value: boolean) => boolean)) => void;
  measureMode: "off" | "distance" | "area";
  setMeasureMode: (mode: "off" | "distance" | "area") => void;
}

function MapLibreAnalyticalToolbar({
  showComps,
  setShowComps,
  showHeatmap,
  setShowHeatmap,
  showIsochrone,
  setShowIsochrone,
  measureMode,
  setMeasureMode,
}: MapLibreAnalyticalToolbarProps) {
  return (
    <div className="absolute left-3 top-[150px] z-10 flex flex-col gap-1 rounded-lg bg-white/95 p-1 text-sm shadow-lg">
      <button
        title="Toggle Measurements"
        onClick={() =>
          setMeasureMode(measureMode === "off" ? "distance" : "off")
        }
        className={`h-8 w-8 rounded ${measureMode !== "off" ? "bg-blue-600 text-white" : "bg-white text-gray-700 hover:bg-gray-100"}`}
      >
        ✎
      </button>
      <button
        title="Comparable Sales"
        onClick={() => setShowComps((value) => !value)}
        className={`h-8 w-8 rounded text-xs font-bold ${showComps ? "bg-green-500 text-white" : "bg-white text-gray-700 hover:bg-gray-100"}`}
      >
        $
      </button>
      <button
        title="Price Heatmap"
        onClick={() => setShowHeatmap((value) => !value)}
        className={`h-8 w-8 rounded ${showHeatmap ? "bg-orange-500 text-white" : "bg-white text-gray-700 hover:bg-gray-100"}`}
      >
        ◑
      </button>
      <button
        title="Drive Time Isochrone"
        onClick={() => setShowIsochrone((value) => !value)}
        className={`h-8 w-8 rounded ${showIsochrone ? "bg-purple-500 text-white" : "bg-white text-gray-700 hover:bg-gray-100"}`}
      >
        ⌖
      </button>
    </div>
  );
}

function MapLibreMeasureTool({
  map,
  mode,
  setMode,
}: {
  map: maplibregl.Map | null;
  mode: "off" | "distance" | "area";
  setMode: (mode: "off" | "distance" | "area") => void;
}) {
  const [totalDistance, setTotalDistance] = useState(0);
  const [totalArea, setTotalArea] = useState(0);
  const [points, setPoints] = useState<maplibregl.LngLat[]>([]);

  const mapRef = useRef(map);
  const sourceId = "measure-feature-source";
  const lineLayerId = "measure-line-layer";
  const fillLayerId = "measure-fill-layer";
  const pointLayerId = "measure-point-layer";
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const mapLoadedRef = useRef(false);

  const clear = useCallback(() => {
    setPoints([]);
    setTotalDistance(0);
    setTotalArea(0);
    const source = mapRef.current?.getSource(sourceId) as
      | { setData: (data: GeoJSON.FeatureCollection) => void }
      | undefined;
    source?.setData({
      type: "FeatureCollection",
      features: [],
    });
    popupRef.current?.remove();
    popupRef.current = null;
  }, []);

  const buildFeatures = useCallback(
    (nextPoints: maplibregl.LngLat[]) => {
      const lineString: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: [],
      };

      if (nextPoints.length >= 1) {
        for (const pt of nextPoints) {
          lineString.features.push({
            type: "Feature",
            geometry: {
              type: "Point",
              coordinates: [pt.lng, pt.lat],
            },
            properties: { kind: "point" },
          });
        }
      }

      if (mode === "distance" || mode === "area") {
        if (nextPoints.length >= 2) {
          lineString.features.push({
            type: "Feature",
            geometry: {
              type: "LineString",
              coordinates: nextPoints.map((point) => [point.lng, point.lat]),
            },
            properties: { kind: "line" },
          });
        }

        if (mode === "area" && nextPoints.length >= 3) {
          const polygonCoordinates = nextPoints.map((point) => [point.lng, point.lat] as [number, number]);
          polygonCoordinates.push([nextPoints[0].lng, nextPoints[0].lat]);
          lineString.features.push({
            type: "Feature",
            geometry: {
              type: "Polygon",
              coordinates: [polygonCoordinates],
            },
            properties: { kind: "area" },
          });
        }
      }

      return lineString;
    },
    [mode]
  );

  const recalculate = useCallback(
    (nextPoints: maplibregl.LngLat[]) => {
      if (nextPoints.length < 2) {
        setTotalDistance(0);
        setTotalArea(0);
        return;
      }

      if (mode === "distance") {
        let d = 0;
        for (let i = 1; i < nextPoints.length; i++) {
          d += haversineDistanceMeters(nextPoints[i - 1], nextPoints[i]);
        }
        setTotalDistance(d);
      }

      if (mode === "area" && nextPoints.length >= 3) {
        setTotalArea(polygonAreaSquareMeters(nextPoints));
      } else if (mode === "area") {
        setTotalArea(0);
      }
    },
    [mode]
  );

  useEffect(() => {
    mapRef.current = map;
  }, [map]);

  useEffect(() => {
    if (!mapRef.current) return;
    if (mapLoadedRef.current) {
      if (mode === "off") {
        mapRef.current.getCanvas().style.cursor = "";
        clear();
        return;
      }
      mapRef.current.getCanvas().style.cursor = "crosshair";
    }
  }, [map, mode, clear]);

  useEffect(() => {
    const mapInstance = mapRef.current;
    if (!mapInstance) return;

    const setup = () => {
      mapLoadedRef.current = true;

      if (!mapInstance.getSource(sourceId)) {
        mapInstance.addSource(sourceId, {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: [],
          },
        });

        mapInstance.addLayer({
          id: pointLayerId,
          type: "circle",
          source: sourceId,
          filter: ["==", ["get", "kind"], "point"],
          paint: {
            "circle-radius": 5,
            "circle-color": "#3b82f6",
            "circle-stroke-width": 2,
            "circle-stroke-color": "#ffffff",
          },
        });
        mapInstance.addLayer({
          id: lineLayerId,
          type: "line",
          source: sourceId,
          filter: ["==", ["get", "kind"], "line"],
          paint: {
            "line-color": "#3b82f6",
            "line-width": 3,
            "line-dasharray": [4, 3],
          },
        });
        mapInstance.addLayer({
          id: fillLayerId,
          type: "fill",
          source: sourceId,
          filter: ["==", ["get", "kind"], "area"],
          paint: {
            "fill-color": "#3b82f6",
            "fill-opacity": 0.12,
            "fill-outline-color": "#3b82f6",
          },
        });
      }

      const source = mapInstance.getSource(sourceId) as
        | { setData: (data: GeoJSON.FeatureCollection) => void }
        | undefined;
      source?.setData(buildFeatures(points));
      recalculate(points);
    };

    const clickHandler = (event: maplibregl.MapMouseEvent) => {
      if (mode === "off" || !mapLoadedRef.current) return;
      const next = [...points, event.lngLat];
      setPoints(next);
      const source = mapInstance.getSource(sourceId) as
        | { setData: (data: GeoJSON.FeatureCollection) => void }
        | undefined;
      source?.setData(buildFeatures(next));
      recalculate(next);
    };

    setup();
    mapInstance.on("click", clickHandler);

    return () => {
      mapInstance.off("click", clickHandler);
      if (mode === "off") {
        const source = mapInstance.getSource(sourceId) as
          | { setData: (data: GeoJSON.FeatureCollection) => void }
          | undefined;
        source?.setData({
          type: "FeatureCollection",
          features: [],
        });
      }
      if (!mode || mode === "off") {
        mapInstance.getCanvas().style.cursor = "";
      }
    };
  }, [mode, buildFeatures, points, recalculate]);

  useEffect(() => {
    clear();
  }, [mode, clear]);

  if (mode === "off") {
    return null;
  }

  return (
    <div
      className="absolute right-16 top-2 z-10 rounded-md border bg-white/95 p-2 text-xs shadow-lg"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="mb-1 flex items-center justify-between gap-1">
        <div className="text-xs font-semibold uppercase text-gray-600">
          {mode === "distance" ? "Distance" : "Area"}
        </div>
        <div className="flex gap-1">
          <button
            className="rounded px-1 text-gray-500 hover:text-gray-700"
            onClick={clear}
            title="Clear"
          >
            ⟲
          </button>
          <button
            className="rounded px-1 text-gray-500 hover:text-gray-700"
            onClick={() => setMode("off")}
            title="Close"
          >
            ✕
          </button>
        </div>
      </div>
      <div className="text-lg font-bold text-gray-900">
        {mode === "distance"
          ? totalDistance > 0
            ? formatDistance(totalDistance)
            : "Click map to start"
          : totalArea > 0
            ? formatArea(totalArea)
            : `${points.length < 3 ? `${points.length}/3 points` : "Click to add points"}`}
      </div>
      <div className="mt-1 text-[10px] text-gray-500">
        {mode === "distance" ? "Click map to add waypoints" : "Click map to define area"}
      </div>
      <div className="mt-1 flex gap-1.5">
        <button
          onClick={() => setMode("distance")}
          className={`rounded px-2 py-0.5 text-[10px] ${mode === "distance" ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-600"}`}
        >
          Distance
        </button>
        <button
          onClick={() => setMode("area")}
          className={`rounded px-2 py-0.5 text-[10px] ${mode === "area" ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-600"}`}
        >
          Area
        </button>
      </div>
    </div>
  );
}

interface MapLibreCompSaleLayerProps {
  map: maplibregl.Map | null;
  visible: boolean;
  centerLat?: number;
  centerLng?: number;
  parcelsCount?: number;
}

type CompSaleProperties = {
  id: string;
  address: string;
  salePrice: number | null;
  saleDate: string | null;
  acreage: number | null;
  pricePerAcre: number | null;
  pricePerSf: number | null;
  useType: string | null;
  color: string;
  radius: number;
  opacity: number;
  label: string;
};

function MapLibreCompSaleLayer({
  map,
  visible,
  centerLat,
  centerLng,
}: MapLibreCompSaleLayerProps) {
  const [comps, setComps] = useState<CompSale[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchAddress, setSearchAddress] = useState("");
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const sourceId = "maplibre-comps-source";
  const layerId = "maplibre-comps-layer";
  const labelLayerId = "maplibre-comps-label-layer";

  const mapRef = useRef(map);
  useEffect(() => {
    mapRef.current = map;
  }, [map]);

  const clear = useCallback(() => {
    setComps([]);
    setSearched(false);
    setSearchAddress("");
    const source = mapRef.current?.getSource(sourceId) as
      | { setData: (data: GeoJSON.FeatureCollection) => void }
      | undefined;
    source?.setData({
      type: "FeatureCollection",
      features: [],
    });
    popupRef.current?.remove();
  }, []);

  const searchComps = useCallback(
    async (lat?: number, lng?: number, address?: string) => {
      if (!mapRef.current) return;
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (lat != null && lng != null) {
          params.set("lat", String(lat));
          params.set("lng", String(lng));
          params.set("radiusMiles", "3");
        }
        if (address) params.set("address", address);

        const res = await fetch(`/api/map/comps?${params}`);
        if (!res.ok) return;

        const data = await res.json();
        setComps(data.comps || []);
        setSearched(true);

        if (data.comps?.length > 0) {
          const bounds = new maplibregl.LngLatBounds();
          for (const comp of data.comps as CompSale[]) {
            bounds.extend([comp.lng, comp.lat]);
          }
          if (!bounds.isEmpty()) {
            mapRef.current.fitBounds(bounds, { padding: 50, maxZoom: 15 });
          }
        }
      } catch {
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const compSource = useMemo<GeoJSON.FeatureCollection<GeoJSON.Point, CompSaleProperties>>(() => {
    const maxPricePerAcre = Math.max(
      ...comps.map((comp) => comp.pricePerAcre || 1),
      1
    );

    return {
      type: "FeatureCollection" as const,
      features: comps.map((comp): GeoJSON.Feature<GeoJSON.Point, CompSaleProperties> => {
        const normalizedOpacity = comp.pricePerAcre
          ? comp.pricePerAcre / maxPricePerAcre
          : 0.4;
        const pointOpacity = comp.acreage
          ? Math.min(1, Math.max(0.15, normalizedOpacity))
          : 0.4;
        return {
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [comp.lng, comp.lat],
          },
          properties: {
            id: comp.id,
            address: comp.address,
            salePrice: comp.salePrice ?? null,
            saleDate: comp.saleDate,
            acreage: comp.acreage ?? null,
            pricePerAcre: comp.pricePerAcre ?? null,
            pricePerSf: comp.pricePerSf ?? null,
            useType: comp.useType ?? null,
            color: getRecencyColor(comp.saleDate),
            radius: comp.salePrice ? 8 : 7,
            opacity: pointOpacity,
            label: formatCompLabel(comp),
          },
        };
      }),
    };
  }, [comps]);

  useEffect(() => {
    const mapInstance = mapRef.current;
    if (!mapInstance) return;

    if (!visible) {
      const source = mapInstance.getSource(sourceId) as
        | { setData: (data: GeoJSON.FeatureCollection) => void }
        | undefined;
      source?.setData({ type: "FeatureCollection", features: [] });
      if (mapInstance.getLayer(layerId)) {
        mapInstance.setLayoutProperty(layerId, "visibility", "none");
      }
      if (mapInstance.getLayer(labelLayerId)) {
        mapInstance.setLayoutProperty(labelLayerId, "visibility", "none");
      }
      return;
    }

    if (!mapInstance.getSource(sourceId)) {
      mapInstance.addSource(sourceId, {
        type: "geojson",
        data: compSource,
      });
      mapInstance.addLayer({
        id: layerId,
        type: "circle",
        source: sourceId,
        paint: {
          "circle-color": ["get", "color"],
          "circle-radius": ["max", 6, ["to-number", ["get", "radius"]]],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
          "circle-opacity": ["get", "opacity"],
          "circle-stroke-opacity": 0.9,
        },
      });
      mapInstance.addLayer({
        id: labelLayerId,
        type: "symbol",
        source: sourceId,
        layout: {
          "text-field": ["get", "label"],
          "text-size": 11,
          "text-offset": [0, -1.4],
          "text-anchor": "top",
          "text-allow-overlap": false,
        },
        paint: {
          "text-color": "#1f2937",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.2,
          "text-opacity": 0.95,
        },
      });

      const onCompClick = (event: maplibregl.MapLayerMouseEvent) => {
        const feature = event.features?.[0];
        const props = feature?.properties as
          | (Record<string, string | number | null> & {
              id?: string;
            })
          | undefined;
        if (!props) return;

        const comp: CompSale = {
          id: String(props.id || ""),
          address: String(props.address || "Unknown"),
          lat: event.lngLat.lat,
          lng: event.lngLat.lng,
          salePrice: toFiniteNumber(props.salePrice),
          saleDate: typeof props.saleDate === "string" ? props.saleDate : null,
          acreage: toFiniteNumber(props.acreage),
          pricePerAcre: toFiniteNumber(props.pricePerAcre),
          pricePerSf: toFiniteNumber(props.pricePerSf),
          useType: typeof props.useType === "string" ? props.useType : null,
        };

        popupRef.current?.remove();
        popupRef.current = new maplibregl.Popup({ closeOnClick: true })
          .setLngLat([event.lngLat.lng, event.lngLat.lat])
          .setHTML(`<div style="font-size:13px;line-height:1.4">
            <div style="font-weight:600;margin-bottom:2px;">${comp.address}</div>
            ${comp.salePrice != null ? `<div style="font-size:14px;font-weight:700;color:#1e40af;">${formatCurrency(comp.salePrice)}</div>` : ""}
            ${comp.pricePerAcre != null ? `<div style="font-size:11px;">${formatCurrency(comp.pricePerAcre)} / acre</div>` : ""}
            ${comp.pricePerSf != null ? `<div style="font-size:11px;">$${comp.pricePerSf.toFixed(2)} / SF</div>` : ""}
            ${comp.acreage != null ? `<div style="font-size:11px;">${comp.acreage.toFixed(2)} acres</div>` : ""}
            ${comp.saleDate != null ? `<div style="font-size:11px;color:#6b7280;">Sold: ${new Date(comp.saleDate).toLocaleDateString()} (${getRecencyLabel(comp.saleDate)})</div>` : ""}
            ${comp.useType ? `<div style="font-size:11px;color:#6b7280;">Use: ${comp.useType}</div>` : ""}
          </div>`)
          .addTo(mapInstance);
      };

      mapInstance.on("click", layerId, onCompClick);
      mapInstance.on("click", labelLayerId, onCompClick);
      mapInstance.on("mouseenter", layerId, () => {
        mapInstance.getCanvas().style.cursor = "pointer";
      });
      mapInstance.on("mouseenter", labelLayerId, () => {
        mapInstance.getCanvas().style.cursor = "pointer";
      });
      mapInstance.on("mouseleave", layerId, () => {
        mapInstance.getCanvas().style.cursor = "";
      });
      mapInstance.on("mouseleave", labelLayerId, () => {
        mapInstance.getCanvas().style.cursor = "";
      });
    } else {
      const source = mapInstance.getSource(sourceId) as
        | { setData: (data: GeoJSON.FeatureCollection) => void }
        | undefined;
      source?.setData(compSource);
    }
    mapInstance.setLayoutProperty(layerId, "visibility", "visible");
    if (mapInstance.getLayer(labelLayerId)) {
      mapInstance.setLayoutProperty(labelLayerId, "visibility", "visible");
    }

    if (visible && centerLat != null && centerLng != null && !searched) {
      searchComps(centerLat, centerLng);
    }
  }, [centerLat, centerLng, compSource, clear, visible, map, searched, searchComps]);

  useEffect(() => {
    if (!visible) {
      clear();
      return;
    }
  }, [visible, clear]);

  if (!visible) return null;

  return (
    <div
      className="absolute right-16 top-2 z-10 rounded-md border bg-white/95 p-2 text-xs shadow-lg"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="font-semibold text-gray-600 uppercase text-[11px]">Comparable Sales</div>
      <form
        className="mt-1.5 flex gap-1"
        onSubmit={(event) => {
          event.preventDefault();
          if (searchAddress.trim()) {
            searchComps(undefined, undefined, searchAddress.trim());
          } else if (centerLat != null && centerLng != null) {
            searchComps(centerLat, centerLng);
          } else if (mapRef.current) {
            const center = mapRef.current.getCenter();
            searchComps(center.lat, center.lng);
          }
        }}
      >
        <input
          type="text"
          value={searchAddress}
          onChange={(event) => setSearchAddress(event.target.value)}
          placeholder="Address or use map center"
          className="min-w-0 flex-1 rounded border px-2 py-1 text-xs"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded bg-blue-500 px-2 py-1 text-xs text-white disabled:opacity-50"
        >
          {loading ? "..." : "Search"}
        </button>
      </form>
      {searched && <p className="mt-1 text-[10px] text-gray-500">{comps.length} comp{comps.length !== 1 ? "s" : ""} found</p>}
      <div className="mt-2 flex gap-2 text-[10px] text-gray-500">
        <span className="flex items-center gap-0.5"><span className="inline-block h-2 w-2 rounded-full bg-green-500" />{" <6mo"}</span>
        <span className="flex items-center gap-0.5"><span className="inline-block h-2 w-2 rounded-full bg-yellow-500" /> 6-12mo</span>
      </div>
    </div>
  );
}

interface MapLibreHeatmapLayerProps {
  map: maplibregl.Map | null;
  parcels: MapParcel[];
  visible: boolean;
}

function MapLibreHeatmapLayer({ map, parcels, visible }: MapLibreHeatmapLayerProps) {
  const mapRef = useRef(map);
  const sourceId = "maplibre-heatmap-source";
  const layerId = "maplibre-heatmap-layer";

  useEffect(() => {
    mapRef.current = map;
  }, [map]);

  const heatSource = useMemo(() => {
    const maxAcreage = Math.max(...parcels.map((parcel) => Number(parcel.acreage || 1)), 1);
    return {
      type: "FeatureCollection" as const,
      features: parcels.map(
        (parcel): GeoJSON.Feature<GeoJSON.Point, HeatPointProperties> => ({
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [parcel.lng, parcel.lat],
          },
          properties: {
            intensity: parcel.acreage ? Number(parcel.acreage) / maxAcreage : 0.3,
            address: parcel.address,
          },
        })
      ),
    } as GeoJSON.FeatureCollection<GeoJSON.Point, HeatPointProperties>;
  }, [parcels]);

  useEffect(() => {
    const mapInstance = mapRef.current;
    if (!mapInstance) return;

    if (!visible) {
      if (mapInstance.getLayer(layerId)) {
        mapInstance.setLayoutProperty(layerId, "visibility", "none");
      }
      return;
    }

    if (!mapInstance.getSource(sourceId)) {
      mapInstance.addSource(sourceId, {
        type: "geojson",
        data: heatSource,
      });
      mapInstance.addLayer({
        id: layerId,
        type: "heatmap",
        source: sourceId,
        paint: {
          "heatmap-weight": ["interpolate", ["linear"], ["get", "intensity"], 0, 0, 1, 1],
          "heatmap-intensity": 1,
          "heatmap-color": [
            "interpolate",
            ["linear"],
            ["heatmap-density"],
            0,
            "rgba(59, 130, 246,0)",
            0.2,
            "rgba(59, 130, 246, 0.45)",
            0.5,
            "rgba(34, 211, 238, 0.55)",
            0.8,
            "rgba(16, 185, 129, 0.7)",
            1,
            "rgba(239, 68, 68, 0.85)",
          ],
          "heatmap-radius": 20,
          "heatmap-opacity": 0.75,
        },
      });
    } else {
      const source = mapInstance.getSource(sourceId) as
        | { setData: (data: GeoJSON.FeatureCollection) => void }
        | undefined;
      source?.setData(heatSource);
    }

    mapInstance.setLayoutProperty(layerId, "visibility", "visible");
  }, [visible, heatSource]);

  if (!visible) return null;
  return null;
}

interface MapLibreIsochroneControlProps {
  map: maplibregl.Map | null;
  parcels: MapParcel[];
  visible: boolean;
}

const MAP_DRIVE_TIMES = [5, 10, 15, 30] as const;

function MapLibreIsochroneControl({
  map,
  parcels,
  visible,
}: MapLibreIsochroneControlProps) {
  const [minutes, setMinutes] = useState<number>(10);
  const [clickMode, setClickMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IsochroneResult | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const mapRef = useRef(map);
  const sourceId = "maplibre-isochrone-source";
  const lineId = "maplibre-isochrone-line";
  const fillId = "maplibre-isochrone-fill";
  const centerSourceId = "maplibre-isochrone-center-source";
  const centerLayerId = "maplibre-isochrone-center-layer";

  useEffect(() => {
    mapRef.current = map;
  }, [map]);

  const clearResult = useCallback(() => {
    setResult(null);
    popupRef.current?.remove();
    popupRef.current = null;
  }, []);

  const countParcelsInPolygon = useCallback(
    (ring: [number, number][]) => {
      if (ring.length === 0) return 0;
      return parcels.reduce((count, parcel) => {
        return count + (isPointInPolygon([parcel.lng, parcel.lat], ring) ? 1 : 0);
      }, 0);
    },
    [parcels]
  );

  const compute = useCallback(
    async (lat: number, lng: number, minutesToUse: number) => {
      setLoading(true);
      setError(null);
      clearResult();
      setClickMode(false);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      try {
        const res = await fetch("/api/map/isochrone", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lat, lng, minutes: minutesToUse }),
          signal: controller.signal,
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          setError(
            typeof payload?.error === "string"
              ? payload.error
              : "Drive-time analysis failed"
          );
          return;
        }
        const data = await res.json();
        if (!data.polygon?.length) {
          setError("No drive-time polygon returned for this location");
          return;
        }

        const polygon = data.polygon.map(([pLat, pLng]: [number, number]) => [pLng, pLat] as [number, number]);
        const lngLats = polygon.map(([lng, lat]: [number, number]) => [lng, lat] as [number, number]);
        const parcelCount = countParcelsInPolygon(lngLats);
        setResult({
          polygon: lngLats,
          center: [lat, lng],
          minutes: minutesToUse,
          parcelCount,
        });
        const bounds = new maplibregl.LngLatBounds();
        for (const point of lngLats) bounds.extend(point);
        if (!bounds.isEmpty()) {
          mapRef.current?.fitBounds(bounds, { padding: 40 });
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          setError("Drive-time analysis timed out. Try a shorter drive time.");
        } else {
          setError("Drive-time analysis failed. Please try again.");
        }
      } finally {
        clearTimeout(timeout);
        setLoading(false);
      }
    },
    [clearResult, countParcelsInPolygon]
  );

  useEffect(() => {
    const mapInstance = mapRef.current;
    if (!mapInstance) return;

    const handleMapClick = (event: maplibregl.MapMouseEvent) => {
      if (!visible || !clickMode) return;
      compute(event.lngLat.lat, event.lngLat.lng, minutes);

      const centerSource = mapInstance.getSource(centerSourceId) as
        | { setData: (data: GeoJSON.FeatureCollection) => void }
        | undefined;
      centerSource?.setData({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: {
              type: "Point",
              coordinates: [event.lngLat.lng, event.lngLat.lat],
            },
            properties: {},
          },
        ],
      });
    };

    if (!visible) {
      mapInstance.off("click", handleMapClick);
      clearResult();
      setError(null);
      setClickMode(false);
      if (mapInstance.getLayer(fillId)) {
        mapInstance.setLayoutProperty(fillId, "visibility", "none");
      }
      if (mapInstance.getLayer(lineId)) {
        mapInstance.setLayoutProperty(lineId, "visibility", "none");
      }
      if (mapInstance.getLayer(centerLayerId)) {
        mapInstance.setLayoutProperty(centerLayerId, "visibility", "none");
      }
      popupRef.current?.remove();
      return;
    }

    if (!mapInstance.getSource(sourceId)) {
      mapInstance.addSource(sourceId, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      mapInstance.addLayer({
        id: fillId,
        type: "fill",
        source: sourceId,
        paint: {
          "fill-color": "#7c3aed",
          "fill-opacity": 0.12,
        },
      });
      mapInstance.addLayer({
        id: lineId,
        type: "line",
        source: sourceId,
        paint: {
          "line-color": "#7c3aed",
          "line-width": 2,
          "line-opacity": 0.8,
        },
      });

      if (!mapInstance.getSource(centerSourceId)) {
        mapInstance.addSource(centerSourceId, {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: [],
          },
        });
        mapInstance.addLayer({
          id: centerLayerId,
          type: "circle",
          source: centerSourceId,
          paint: {
            "circle-color": "#7c3aed",
            "circle-radius": 6,
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 2,
          },
        });
      }

      mapInstance.on("click", handleMapClick);
    }
  }, [visible, clickMode, compute, clearResult, minutes, mapRef]);

  useEffect(() => {
    const mapInstance = mapRef.current;
    const source = mapInstance?.getSource(sourceId) as
      | { setData: (data: GeoJSON.FeatureCollection) => void }
      | undefined;
    const centerSource = mapInstance?.getSource(centerSourceId) as
      | { setData: (data: GeoJSON.FeatureCollection) => void }
      | undefined;
    const layerSource = mapInstance?.getLayer(fillId);

    if (!mapInstance) return;
    if (!layerSource || !source) return;

    if (!result) {
      source.setData({ type: "FeatureCollection", features: [] });
      centerSource?.setData({ type: "FeatureCollection", features: [] });
      if (mapInstance.getLayer(fillId)) {
        mapInstance.setLayoutProperty(fillId, "visibility", "none");
      }
      if (mapInstance.getLayer(lineId)) {
        mapInstance.setLayoutProperty(lineId, "visibility", "none");
      }
      if (mapInstance.getLayer(centerLayerId)) {
        mapInstance.setLayoutProperty(centerLayerId, "visibility", "none");
      }
      return;
    }

    if (mapInstance.getLayer(fillId)) {
      mapInstance.setLayoutProperty(fillId, "visibility", "visible");
    }
    if (mapInstance.getLayer(lineId)) {
      mapInstance.setLayoutProperty(lineId, "visibility", "visible");
    }
    if (mapInstance.getLayer(centerLayerId)) {
      mapInstance.setLayoutProperty(centerLayerId, "visibility", "visible");
    }

    source?.setData({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [result.polygon],
          },
          properties: {
            minutes: result.minutes,
            parcelCount: result.parcelCount,
          },
        },
      ],
    });
  }, [result]);

  if (!visible) return null;

  return (
    <div
      className="absolute right-2 bottom-16 z-10 rounded-md border bg-white/95 p-2 text-xs shadow-lg"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-gray-600 text-[11px] font-semibold uppercase">
          Drive Time
        </div>
        {(result || clickMode) && (
          <button
            onClick={() => {
              clearResult();
              setError(null);
              setClickMode(false);
              if (mapRef.current) mapRef.current.getCanvas().style.cursor = "";
            }}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        )}
      </div>
      <div className="mt-1.5 flex gap-1">
        {MAP_DRIVE_TIMES.map((t) => (
          <button
            key={t}
            onClick={() => setMinutes(t)}
            className={`rounded px-1.5 py-1 text-xs ${minutes === t ? "bg-purple-500 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
          >
            {t}m
          </button>
        ))}
      </div>
      <button
        onClick={() => {
          setClickMode(true);
          setError(null);
          if (mapRef.current) mapRef.current.getCanvas().style.cursor = "crosshair";
        }}
        disabled={loading}
        className="mt-1.5 w-full rounded bg-purple-500 px-2 py-1.5 text-xs font-medium text-white hover:bg-purple-600 disabled:opacity-50"
      >
        {loading ? "Computing..." : clickMode ? "Click map to set center" : "Click map to analyze"}
      </button>
      {result && (
        <div className="mt-1.5 rounded bg-purple-50 px-2 py-1.5 text-xs">
          <div className="font-semibold text-purple-800">{result.minutes}-min drive area</div>
          <div className="text-purple-600">{result.parcelCount} parcel{result.parcelCount !== 1 ? "s" : ""} in range</div>
        </div>
      )}
      {error && (
        <div className="mt-1.5 rounded bg-red-50 px-2 py-1.5 text-xs text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}
