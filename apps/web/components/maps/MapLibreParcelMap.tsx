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
import maplibregl, { type ExpressionSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import {
  useParcelGeometry,
  type GeometryLoadSummary,
  type ViewportBounds,
} from "./useParcelGeometry";
import {
  buildTileParcelPopupViewModel,
  presentMapPopup,
  type MapPopupAction,
} from "./MapPopupPresenter";
import { bindMapInteractionHandlers } from "./mapLibreAdapter";
import {
  getStreetTileUrls,
  getSatelliteTileUrl,
  getParcelTileUrl,
  getMartinParcelTileUrl,
  getZoningProxyTileUrl,
} from "./tileUrls";
import {
  buildZoningTileColorExpression,
  buildZoningTileLayer,
  buildZoningTileSource,
  resolveAvailableZoningTileContract,
  ZONING_TILE_INSERT_BEFORE_LAYER_ID,
  ZONING_TILE_LAYER_ID,
  ZONING_TILE_SOURCE_KEY,
  type ZoningTileContract,
} from "./zoningLayerConfig";
import {
  STATUS_COLORS,
  DEFAULT_STATUS_COLOR,
  getZoningColor,
  getFloodColor,
  DARK_BASE_TILES,
  DARK_STATUS_COLORS,
} from "./mapStyles";
import { MapWorkbenchPanel } from "./MapWorkbenchPanel";
import { MapLegend } from "./MapLegend";
import { ParcelColorModeControl } from "./ParcelColorModeControl";
import { MapGeocoder } from "./MapGeocoder";
import { ParcelDetailCard } from "./ParcelDetailCard";
import { ParcelHoverTooltip } from "./ParcelHoverTooltip";
import { useStableOptions } from "@/lib/hooks/useStableOptions";
import { useIsMobile } from "@/hooks/useIsMobile";
import { cn } from "@/lib/utils";
import { ParcelComparisonSheet } from "./ParcelComparisonSheet";
import { SplitMapCompare } from "./SplitMapCompare";
import { MapTour } from "./MapTour";
import {
  HEATMAP_PRESET_MAP,
} from "./heatmapPresets";
import {
  type ParcelColorMode,
  getParcelFillColor,
  getParcelFillOpacity,
  getParcelLineColor,
  getParcelLineWidth,
  getParcelLineOpacity,
} from "./parcelColorExpressions";
import type {
  HeatmapPresetKey,
  MapHudState,
  MapParcel,
  MapReferenceOverlayState,
  MapTrajectoryData,
  MapTrajectoryVelocityDatum,
  MapWorkbenchPreset,
  SaleComp,
} from "./types";
import type { GeocodedPlace } from "@/utils/geocoder";
import type { ParcelHoverTarget } from "./mapLibreAdapter";

const MAP_DRAW_ACCENT_COLOR = "#6c8cff";
const DEFAULT_REFERENCE_OVERLAY_STATE: MapReferenceOverlayState = {
  parcelBoundaries: true,
  zoning: false,
  flood: false,
  mobileHomePark: true,
  soils: false,
  wetlands: false,
  epa: false,
};

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
  address?: string;
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
  /** GeoJSON ring coords [lng,lat]. Rendered as search-area overlay. */
  polygon?: number[][][] | null;
  /** Called with GeoJSON ring coords when user finishes drawing. */
  onPolygonDrawn?: (coordinates: number[][][]) => void;
  onPolygonCleared?: () => void;
  /** Legacy: GeoJSON FeatureCollection from Market Trajectory agent. */
  trajectoryData?: MapTrajectoryData | null;
  /** Velocity overlay: parcel_id + velocity_of_change; colored choropleth. */
  trajectoryVelocityData?: MapTrajectoryVelocityDatum[] | null;
  /** Externally controlled highlight (e.g. ProspectMap selectedIds). */
  highlightParcelIds?: Set<string>;
  /** Externally controlled selected ids. */
  selectedParcelIds?: Set<string>;
  /** Called when selection changes. */
  onSelectionChange?: (ids: Set<string>) => void;
  /** Called on moveend with map center and zoom. */
  onViewStateChange?: (center: [number, number], zoom: number, bounds?: ViewportBounds) => void;
  /** Called once the MapLibre style is loaded and imperative APIs are safe. */
  onMapReady?: () => void;
  /** Called whenever overlay/draw state changes for outer HUD surfaces. */
  onHudStateChange?: (state: MapHudState) => void;
  /** Optional search UI rendered at the top of the layer panel. */
  searchSlot?: React.ReactNode;
  /** Optional status labels shown in the workbench footer. */
  dataFreshnessLabel?: string;
  latencyLabel?: string;
}

export interface MapLibreParcelMapRef {
  flyTo: (opts: { center: [number, number]; zoom?: number }) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  highlightParcels: (
    parcelIds: string[],
    style?: "pulse" | "outline" | "fill",
    color?: string,
    durationMs?: number,
  ) => void;
  addTemporaryLayer: (
    layerId: string,
    geojson: GeoJSON.FeatureCollection,
    style?: {
      fillColor?: string;
      fillOpacity?: number;
      strokeColor?: string;
      strokeWidth?: number;
    },
  ) => void;
  clearTemporaryLayers: (layerIds?: string[]) => void;
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
    const parsed = saved ? (JSON.parse(saved) as Record<string, boolean>) : {};
    const parcelBoundaries = parsed["Parcel Boundaries"] !== false;
    const zoning = parsed["Zoning Overlay"] === true;
    const flood = parsed["Flood Zones"] === true;

    // Guard against persisted "all off" overlay state, which makes the map appear empty.
    if (!parcelBoundaries && !zoning && !flood) {
      parsed["Parcel Boundaries"] = true;
    }

    return parsed;
  } catch {
    return {};
  }
}

function getSavedOverlaysFallback(): {
  parcelBoundaries: boolean;
  zoning: boolean;
  flood: boolean;
  soils: boolean;
  wetlands: boolean;
  epa: boolean;
  mobileHomePark: boolean;
} {
  const saved = getSavedOverlays();
  const mobileHomeParksEnabled =
    saved["Mobile Home Parks"] === true || saved["Mobile Home Park"] === true;
  return {
    parcelBoundaries: saved["Parcel Boundaries"] !== false,
    zoning: saved["Zoning Overlay"] === true,
    flood: saved["Flood Zones"] === true,
    soils: saved["Soils"] === true,
    wetlands: saved["Wetlands"] === true,
    epa: saved["EPA Facilities"] === true,
    mobileHomePark: mobileHomeParksEnabled,
  };
}

export function getReferenceOverlayStateForPreset(
  preset: MapWorkbenchPreset,
): MapReferenceOverlayState {
  switch (preset) {
    case "parcel-focus":
    case "reset":
      return { ...DEFAULT_REFERENCE_OVERLAY_STATE };
    case "zoning-scan":
      return {
        ...DEFAULT_REFERENCE_OVERLAY_STATE,
        zoning: true,
      };
    case "flood-risk":
      return {
        ...DEFAULT_REFERENCE_OVERLAY_STATE,
        flood: true,
        wetlands: true,
      };
    case "environmental":
      return {
        ...DEFAULT_REFERENCE_OVERLAY_STATE,
        soils: true,
        wetlands: true,
        epa: true,
      };
    case "full-stack":
      return {
        parcelBoundaries: true,
        zoning: true,
        flood: true,
        soils: true,
        wetlands: true,
        epa: true,
        mobileHomePark: true,
      };
  }
}

export function resolveReferenceOverlayPreset(
  state: MapReferenceOverlayState,
): Exclude<MapWorkbenchPreset, "reset"> | null {
  const presets: Array<Exclude<MapWorkbenchPreset, "reset">> = [
    "parcel-focus",
    "zoning-scan",
    "flood-risk",
    "environmental",
    "full-stack",
  ];

  const matched = presets.find((preset) => {
    const presetState = getReferenceOverlayStateForPreset(preset);
    return (
      presetState.parcelBoundaries === state.parcelBoundaries &&
      presetState.zoning === state.zoning &&
      presetState.flood === state.flood &&
      presetState.soils === state.soils &&
      presetState.wetlands === state.wetlands &&
      presetState.epa === state.epa &&
      presetState.mobileHomePark === state.mobileHomePark
    );
  });

  return matched ?? null;
}

type GeometryStatusHealth = {
  failedCount: number;
  geometryUnavailable: boolean;
  propertyDbUnconfigured: boolean;
};

export function getGeometryStatusLabel(
  summary: GeometryLoadSummary,
  health: GeometryStatusHealth,
): string | null {
  if (summary.status === "idle") return null;
  if (summary.status === "loading") return "Loading shapes…";
  if (summary.status === "ready") {
    return `${summary.loadedCount} shapes loaded`;
  }
  if (health.propertyDbUnconfigured) return "Parcel geometry gateway unavailable";
  if (summary.status === "unavailable") {
    return health.geometryUnavailable ? "Geometry unavailable" : "Shapes unavailable";
  }
  if (summary.status === "partial") {
    return `${summary.loadedCount} loaded · ${summary.unavailableCount} unavailable`;
  }
  if (health.geometryUnavailable) return "Geometry unavailable";
  if (health.failedCount > 0) return "Some shapes unavailable";
  return null;
}

function statusColorForParcel(parcel: MapParcel): string {
  const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");
  const colors = isDark ? DARK_STATUS_COLORS : STATUS_COLORS;
  const status = parcel.dealStatus || "";

  // Map legacy deal statuses to new format for dark mode
  let lookupStatus = status;
  if (isDark) {
    if (status === "PROSPECTING") lookupStatus = "prospecting";
    else if (status === "UNDER_CONTRACT") lookupStatus = "under_contract";
    else if (status === "CLOSING") lookupStatus = "closing";
    else if (status === "EXITED") lookupStatus = "exited";
    else if (status === "KILLED") lookupStatus = "killed";
  }

  return (colors as Record<string, string>)[lookupStatus] || DEFAULT_STATUS_COLOR;
}

export function formatDistance(meters: number): string {
  const feet = meters * 3.28084;
  if (feet < 5280) return `${Math.round(feet).toLocaleString()} ft`;
  const miles = feet / 5280;
  return `${miles.toFixed(2)} mi`;
}

export function formatArea(sqMeters: number): string {
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

export function haversineDistanceMeters(a: { lng: number; lat: number }, b: { lng: number; lat: number }) {
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

export function polygonAreaSquareMeters(points: maplibregl.LngLat[]): number {
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

export function getParcelClusterRadius(pointCount: number): number {
  if (pointCount <= 10) return 25;
  if (pointCount <= 50) return 35;
  return 45;
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

type GeoJsonSourceHandle = {
  setData: (data: GeoJSON.FeatureCollection) => void;
};

function isGeoJsonSourceHandle(source: unknown): source is GeoJsonSourceHandle {
  if (!source || typeof source !== "object") return false;
  const candidate = source as { setData?: unknown };
  return typeof candidate.setData === "function";
}

export function getGeoJsonSourceSafe(
  map: Pick<maplibregl.Map, "getSource" | "isStyleLoaded"> | null | undefined,
  sourceId: string
): GeoJsonSourceHandle | null {
  if (!map) return null;
  if (!map.isStyleLoaded()) return null;
  try {
    const source = map.getSource(sourceId);
    return isGeoJsonSourceHandle(source) ? source : null;
  } catch {
    return null;
  }
}

export function setGeoJsonSourceDataSafe(
  map: Pick<maplibregl.Map, "getSource" | "isStyleLoaded"> | null | undefined,
  sourceId: string,
  data: GeoJSON.FeatureCollection
): boolean {
  const source = getGeoJsonSourceSafe(map, sourceId);
  if (!source) return false;
  try {
    source.setData(data);
    return true;
  } catch {
    return false;
  }
}

function setLayerVisibilitySafe(
  map: Pick<maplibregl.Map, "getLayer" | "setLayoutProperty"> | null | undefined,
  layerId: string,
  visible: boolean,
): void {
  if (!map?.getLayer(layerId)) return;
  try {
    map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
  } catch {
    // Style transitions can race layer updates; visibility will reconcile on the next effect.
  }
}

function moveLayerBeforeSafe(
  map: Pick<maplibregl.Map, "getLayer" | "moveLayer"> | null | undefined,
  layerId: string,
  beforeLayerId: string,
): void {
  if (!map?.getLayer(layerId) || !map.getLayer(beforeLayerId)) return;
  try {
    map.moveLayer(layerId, beforeLayerId);
  } catch {
    // Layer ordering is best-effort during source/layer churn.
  }
}

export function computeNextSelection(
  currentSelection: ReadonlySet<string>,
  parcelId: string,
  isMultiSelect: boolean
): Set<string> {
  const next = new Set(currentSelection);
  if (isMultiSelect) {
    if (next.has(parcelId)) next.delete(parcelId);
    else next.add(parcelId);
    return next;
  }

  next.clear();
  next.add(parcelId);
  return next;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Returns operator-facing copy for the draw-area control.
 */
export function getDrawControlState(
  drawing: boolean,
  hasPolygon: boolean,
  pointCount: number,
): { label: string; badge: string; hint: string } {
  if (hasPolygon) {
    return {
      label: "Active area",
      badge: "Live",
      hint: "Search, compare, or save the current polygon before clearing it.",
    };
  }

  if (drawing) {
    return {
      label: "Drawing area",
      badge: `${pointCount} pts`,
      hint:
        pointCount > 0
          ? "Click to add points. Double-click or press Finish to close the area."
          : "Click on the map to start outlining a focused parcel search area.",
    };
  }

  return {
    label: "Draw area",
    badge: "Off",
    hint: "Sketch a polygon to search inside a tighter geography without leaving the map.",
  };
}

export const MapLibreParcelMap = forwardRef<MapLibreParcelMapRef, MapLibreParcelMapProps>(function MapLibreParcelMap({
  parcels,
  center = [-91.1871, 30.4515],
  zoom = 11,
  height = "400px",
  onParcelClick,
  showLayers = true,
  showTools = false,
  polygon = null,
  onPolygonDrawn,
  onPolygonCleared,
  trajectoryData = null,
  trajectoryVelocityData: _trajectoryVelocityData = null,
  highlightParcelIds,
  selectedParcelIds: selectedParcelIdsProp,
  onSelectionChange,
  onViewStateChange,
  onMapReady,
  onHudStateChange,
  searchSlot,
  dataFreshnessLabel,
  latencyLabel,
}, ref) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const temporaryLayerIdsRef = useRef<Map<string, string[]>>(new Map());
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appliedZoningTileContractKeyRef = useRef<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const fittedBoundsRef = useRef("");
  const [mapError, setMapError] = useState<string | null>(null);
  const [zoningTileContract, setZoningTileContract] = useState<ZoningTileContract | null>(null);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number } | null>(null);
  const [detailCardParcel, setDetailCardParcel] = useState<MapParcel | null>(null);
  const [detailCardPoint, setDetailCardPoint] = useState<[number, number] | null>(null);
  const [hoveredParcel, setHoveredParcel] = useState<ParcelHoverTarget | null>(null);
  const [hoverPoint, setHoverPoint] = useState<[number, number] | null>(null);

  const [baseLayer, setBaseLayer] = useState<string>(() => getSavedBaseLayer());
  const [showParcelBoundaries, setShowParcelBoundaries] = useState<boolean>(() => getSavedOverlaysFallback().parcelBoundaries);
  const [parcelColorMode, setParcelColorMode] = useState<ParcelColorMode>("zoning");
  const [showZoning, setShowZoning] = useState<boolean>(() => getSavedOverlaysFallback().zoning);
  const [showFlood, setShowFlood] = useState<boolean>(() => getSavedOverlaysFallback().flood);
  const [showSoils, setShowSoils] = useState<boolean>(() => getSavedOverlaysFallback().soils);
  const [showWetlands, setShowWetlands] = useState<boolean>(() => getSavedOverlaysFallback().wetlands);
  const [showEpa, setShowEpa] = useState<boolean>(() => getSavedOverlaysFallback().epa);
  const [showMobileHomePark, setShowMobileHomePark] = useState<boolean>(() => getSavedOverlaysFallback().mobileHomePark);
  const [showRecentSales, setShowRecentSales] = useState(false);
  const [showNewPermits, setShowNewPermits] = useState(false);
  const [showZoningChanges, setShowZoningChanges] = useState(false);
  const [showComps, setShowComps] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [activeHeatmapPreset, setActiveHeatmapPreset] = useState<HeatmapPresetKey>("sale_activity");
  const [showIsochrone, setShowIsochrone] = useState(false);
  const [show3DExtrusions, setShow3DExtrusions] = useState(false);
  const [measureMode, setMeasureMode] = useState<"off" | "distance" | "area">("off");
  const [lastDrawnMeasureLabel, setLastDrawnMeasureLabel] = useState<string | null>(null);
  const [layerPanelOpen, setLayerPanelOpen] = useState(false);
  const [internalSelectedParcelIds, setInternalSelectedParcelIds] = useState<Set<string>>(new Set());
  const [imperativeHighlightIds, setImperativeHighlightIds] = useState<Set<string>>(new Set());
  const [compareOpen, setCompareOpen] = useState(false);
  const [splitMapOpen, setSplitMapOpen] = useState(false);
  const selectedParcelIds = selectedParcelIdsProp ?? internalSelectedParcelIds;
  const selectedParcelIdsRef = useRef<Set<string>>(selectedParcelIds);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const isSelectionControlledRef = useRef(selectedParcelIdsProp !== undefined);
  const [viewportBounds, setViewportBounds] = useState<ViewportBounds | null>(null);
  const boundsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stableMapCallbacks = useStableOptions({ onParcelClick });
  const parcelByIdRef = useRef<Map<string, MapParcel>>(new Map());
  const isMobile = useIsMobile();

  // Dark mode detection via MutationObserver
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const check = () => setIsDark(document.documentElement.classList.contains("dark"));
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  // Bottom status bar: live coords + zoom
  const [cursorLng, setCursorLng] = useState<number | null>(null);
  const [cursorLat, setCursorLat] = useState<number | null>(null);
  const [currentZoom, setCurrentZoom] = useState(zoom);
  const [drawing, setDrawing] = useState(false);
  const [drawPointCount, setDrawPointCount] = useState(0);
  const drawPointsRef = useRef<maplibregl.LngLat[]>([]);
  const drawSourceId = "draw-polygon-source";
  const drawLineLayerId = "draw-polygon-line";
  const drawPointLayerId = "draw-polygon-points";
  const lastDrawnMeasureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showLiveStatus = process.env.NODE_ENV !== "production";
  const formattedCursor =
    cursorLng !== null && cursorLat !== null
      ? `${cursorLng.toFixed(5)}, ${cursorLat.toFixed(5)}`
      : "Move over the map";

  useEffect(() => {
    return () => {
      if (lastDrawnMeasureTimerRef.current) {
        clearTimeout(lastDrawnMeasureTimerRef.current);
        lastDrawnMeasureTimerRef.current = null;
      }
    };
  }, []);

  // Stable ref for onViewStateChange to avoid stale closure in map event handlers
  const onViewStateChangeRef = useRef(onViewStateChange);
  const onMapReadyRef = useRef(onMapReady);
  useEffect(() => {
    onViewStateChangeRef.current = onViewStateChange;
  }, [onViewStateChange]);

  useEffect(() => {
    onMapReadyRef.current = onMapReady;
  }, [onMapReady]);

  useEffect(() => {
    let cancelled = false;

    void resolveAvailableZoningTileContract()
      .then((contract) => {
        if (!cancelled) {
          setZoningTileContract(contract);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setZoningTileContract(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const hasPolygon = Boolean(polygon && polygon[0] && polygon[0].length >= 4);
  const drawState = getDrawControlState(drawing, hasPolygon, drawPointCount);
  const referenceOverlayState = useMemo<MapReferenceOverlayState>(
    () => ({
      parcelBoundaries: showParcelBoundaries,
      zoning: showZoning,
      flood: showFlood,
      soils: showSoils,
      wetlands: showWetlands,
      epa: showEpa,
      mobileHomePark: showMobileHomePark,
    }),
    [showEpa, showFlood, showParcelBoundaries, showSoils, showWetlands, showZoning, showMobileHomePark],
  );
  const activeWorkbenchPreset = useMemo(
    () => resolveReferenceOverlayPreset(referenceOverlayState),
    [referenceOverlayState],
  );

  useEffect(() => {
    const activeOverlays = [
      showParcelBoundaries ? "parcels" : null,
      showZoning ? "zoning" : null,
      showFlood ? "flood" : null,
      showSoils ? "soils" : null,
      showWetlands ? "wetlands" : null,
      showEpa ? "epa" : null,
      showMobileHomePark ? "mobile_home_parks" : null,
      showComps ? "comps" : null,
      showHeatmap ? "heatmap" : null,
      showIsochrone ? "isochrone" : null,
    ].filter((value): value is string => Boolean(value));

    const drawMode: MapHudState["drawMode"] = drawing ? "drawing" : hasPolygon ? "polygon" : "idle";
    onHudStateChange?.({ activeOverlays, drawMode });
  }, [
    drawing,
    hasPolygon,
    onHudStateChange,
    showComps,
    showEpa,
    showFlood,
    showMobileHomePark,
    showHeatmap,
    showIsochrone,
    showParcelBoundaries,
    showSoils,
    showWetlands,
    showZoning,
  ]);

  useEffect(() => {
    if (!isMobile) return;
    setLayerPanelOpen(false);
  }, [isMobile]);

  useEffect(() => {
    if (selectedParcelIds.size > 0 || hasPolygon || showComps || showHeatmap || showIsochrone) {
      setLayerPanelOpen(true);
    }
  }, [hasPolygon, selectedParcelIds.size, showComps, showHeatmap, showIsochrone]);

  useEffect(() => {
    selectedParcelIdsRef.current = selectedParcelIds;
  }, [selectedParcelIds]);

  useEffect(() => {
    onSelectionChangeRef.current = onSelectionChange;
    isSelectionControlledRef.current = selectedParcelIdsProp !== undefined;
  }, [onSelectionChange, selectedParcelIdsProp]);

  const updateSelection = useCallback((parcelId: string, isMultiSelect: boolean) => {
    const next = computeNextSelection(selectedParcelIdsRef.current, parcelId, isMultiSelect);
    selectedParcelIdsRef.current = next;
    if (isSelectionControlledRef.current) {
      onSelectionChangeRef.current?.(next);
      return;
    }
    setInternalSelectedParcelIds(next);
  }, []);

  const clearDrawing = useCallback(() => {
    drawPointsRef.current = [];
    setDrawPointCount(0);
    setGeoJsonSourceDataSafe(mapRef.current, drawSourceId, {
      type: "FeatureCollection",
      features: [],
    });
  }, [drawSourceId]);

  const finishDrawing = useCallback(() => {
    const pts = drawPointsRef.current;
    if (pts.length < 3) {
      clearDrawing();
      setDrawing(false);
      if (mapRef.current?.getCanvas().style.cursor) {
        mapRef.current.getCanvas().style.cursor = "";
      }
      return;
    }

    const ring = pts.map((point) => [point.lng, point.lat] as [number, number]);
    ring.push(ring[0]);
    const areaLabel = formatArea(polygonAreaSquareMeters(pts));
    clearDrawing();
    setDrawing(false);
    if (mapRef.current?.getCanvas().style.cursor) {
      mapRef.current.getCanvas().style.cursor = "";
    }
    if (lastDrawnMeasureTimerRef.current) {
      clearTimeout(lastDrawnMeasureTimerRef.current);
    }
    setLastDrawnMeasureLabel(areaLabel);
    lastDrawnMeasureTimerRef.current = setTimeout(() => {
      setLastDrawnMeasureLabel(null);
      lastDrawnMeasureTimerRef.current = null;
    }, 5000);
    onPolygonDrawn?.([ring]);
  }, [clearDrawing, onPolygonDrawn]);

  const applyWorkbenchPreset = useCallback((preset: MapWorkbenchPreset) => {
    const nextState = getReferenceOverlayStateForPreset(preset);
    setLayerPanelOpen(true);
    setShowParcelBoundaries(nextState.parcelBoundaries);
    setShowZoning(nextState.zoning);
    setShowFlood(nextState.flood);
    setShowSoils(nextState.soils);
    setShowWetlands(nextState.wetlands);
    setShowEpa(nextState.epa);

    if (preset === "reset") {
      setBaseLayer("Streets");
      setShowComps(false);
      setShowHeatmap(false);
      setActiveHeatmapPreset("sale_activity");
      setShowIsochrone(false);
      setMeasureMode("off");
    }
  }, []);

  const ensureDrawSourceAndLayers = useCallback((map: maplibregl.Map): boolean => {
    if (!map.isStyleLoaded()) return false;

    if (!getGeoJsonSourceSafe(map, drawSourceId)) {
      try {
        map.addSource(drawSourceId, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
      } catch {
        return false;
      }
    }

    try {
      if (!map.getLayer(drawPointLayerId)) {
        map.addLayer({
          id: drawPointLayerId,
          type: "circle",
          source: drawSourceId,
          filter: ["==", ["get", "kind"], "point"],
          paint: {
            "circle-radius": 5,
            "circle-color": MAP_DRAW_ACCENT_COLOR,
            "circle-stroke-width": 2,
            "circle-stroke-color": "#ffffff",
          },
        });
      }
      if (!map.getLayer(drawLineLayerId)) {
        map.addLayer({
          id: drawLineLayerId,
          type: "line",
          source: drawSourceId,
          filter: ["==", ["get", "kind"], "line"],
          paint: {
            "line-color": MAP_DRAW_ACCENT_COLOR,
            "line-width": 2,
            "line-dasharray": [4, 2],
          },
        });
      }
      return true;
    } catch {
      return false;
    }
  }, [drawLineLayerId, drawPointLayerId, drawSourceId]);

  const syncDrawPreview = useCallback((points: maplibregl.LngLat[]) => {
    const features: GeoJSON.Feature[] = points.map((point) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [point.lng, point.lat] },
      properties: { kind: "point" },
    }));

    if (points.length >= 2) {
      features.push({
        type: "Feature" as const,
        geometry: {
          type: "LineString" as const,
          coordinates: [...points.map((point) => [point.lng, point.lat]), [points[0].lng, points[0].lat]],
        },
        properties: { kind: "line" },
      });
    }

    setGeoJsonSourceDataSafe(mapRef.current, drawSourceId, {
      type: "FeatureCollection",
      features,
    });
  }, [drawSourceId]);

  const startDrawing = useCallback(() => {
    if (hasPolygon) return;
    clearDrawing();
    setDrawing(true);
  }, [clearDrawing, hasPolygon]);

  const toggleDrawing = useCallback(() => {
    if (hasPolygon) return;
    if (drawing) {
      finishDrawing();
      return;
    }
    startDrawing();
  }, [drawing, finishDrawing, hasPolygon, startDrawing]);

  const undoDrawPoint = useCallback(() => {
    if (!drawing || drawPointsRef.current.length === 0) return;
    drawPointsRef.current.pop();
    setDrawPointCount(drawPointsRef.current.length);
    syncDrawPreview(drawPointsRef.current);
  }, [drawing, syncDrawPreview]);

  const cancelDrawing = useCallback(() => {
    clearDrawing();
    setDrawing(false);
  }, [clearDrawing]);

  const clearPolygonSelection = useCallback(() => {
    clearDrawing();
    setDrawing(false);
    onPolygonCleared?.();
  }, [clearDrawing, onPolygonCleared]);

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
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
        highlightTimeoutRef.current = null;
      }

      setImperativeHighlightIds(new Set(parcelIds));

      if (durationMs > 0) {
        highlightTimeoutRef.current = setTimeout(() => {
          setImperativeHighlightIds(new Set());
          highlightTimeoutRef.current = null;
        }, durationMs);
      }
    },
    [],
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

  const effectiveSelectedIds = useMemo(() => {
    const merged = new Set(selectedParcelIds);
    if (highlightParcelIds) {
      for (const id of highlightParcelIds) merged.add(id);
    }
    for (const id of imperativeHighlightIds) {
      merged.add(id);
    }
    return merged;
  }, [selectedParcelIds, highlightParcelIds, imperativeHighlightIds]);
  const selectedParcelsForCompare = useMemo(
    () => parcels.filter((parcel) => effectiveSelectedIds.has(parcel.id)),
    [parcels, effectiveSelectedIds]
  );

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

  const { geometries, health: geometryHealth, summary: geometrySummary } = useParcelGeometry(
    parcels,
    80,
    viewportBounds,
  );
  const geometryStatusLabel = getGeometryStatusLabel(geometrySummary, geometryHealth);

  useEffect(() => {
    parcelByIdRef.current = parcelById;
  }, [parcelById]);

  const closeParcelDetailCard = useCallback(() => {
    setDetailCardParcel(null);
    setDetailCardPoint(null);
  }, []);

  useEffect(() => {
    if (detailCardParcel && !parcelById.has(detailCardParcel.id)) {
      closeParcelDetailCard();
    }
  }, [closeParcelDetailCard, detailCardParcel, parcelById]);

  const handlePlaceSelect = useCallback((place: GeocodedPlace) => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    setLayerPanelOpen(true);
    popupRef.current?.remove();
    popupRef.current = null;
    setHoveredParcel(null);
    setHoverPoint(null);

    if (place.parcelId) {
      const parcel = parcelByIdRef.current.get(place.parcelId);
      if (parcel) {
        const canvas = map.getCanvas();
        setDetailCardParcel(parcel);
        setDetailCardPoint([canvas.clientWidth / 2, canvas.clientHeight / 2]);
      } else {
        closeParcelDetailCard();
      }
    } else {
      closeParcelDetailCard();
    }
  }, [closeParcelDetailCard]);

  const handlePopupAction = useCallback((action: MapPopupAction) => {
    if (action.type === "create_deal") {
      const href = action.triage
        ? `/deals/new?parcelId=${encodeURIComponent(action.parcelId)}&step=triage`
        : `/deals/new?parcelId=${encodeURIComponent(action.parcelId)}`;
      window.location.href = href;
      return;
    }

    if (action.type === "screen_parcel") {
      updateSelection(action.parcelId, false);
      return;
    }

    const params = new URLSearchParams({
      parcelId: action.parcelId,
      lat: String(action.lat),
      lng: String(action.lng),
    });
    if (action.address) {
      params.set("address", action.address);
    }
    window.open(`/comps?${params.toString()}`, "_blank", "noopener,noreferrer");
  }, [updateSelection]);

  const toggleMapFullscreen = useCallback(() => {
    const container = mapContainerRef.current;
    if (!container) return;
    if (!document.fullscreenElement) {
      void container.requestFullscreen();
      return;
    }
    void document.exitFullscreen();
  }, []);

  const downloadMapScreenshot = useCallback(() => {
    const canvas = mapRef.current?.getCanvas();
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `map-export-${new Date().toISOString().slice(0, 19).replace(/[:.]/g, "-")}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }, []);

  useEffect(() => {
    const skipTags = new Set(["INPUT", "TEXTAREA", "SELECT"]);
    const shouldSkip = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return false;
      if (skipTags.has(target.tagName.toUpperCase())) return true;
      return target.isContentEditable;
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (shouldSkip(event)) return;
      const key = event.key.toUpperCase();

      if (key === "F") {
        event.preventDefault();
        toggleMapFullscreen();
      }

      if (key === "S") {
        event.preventDefault();
        downloadMapScreenshot();
      }

      if (key === "L") {
        event.preventDefault();
        setLayerPanelOpen((open) => !open);
      }

      if (key === "D") {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent("map:activate-draw"));
      }

      if (key === "ESCAPE") {
        popupRef.current?.remove();
        popupRef.current = null;
        closeParcelDetailCard();
        setHoveredParcel(null);
        setHoverPoint(null);
        setLayerPanelOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeParcelDetailCard, downloadMapScreenshot, toggleMapFullscreen]);

  useEffect(() => {
    const handleActivateDraw = () => {
      if (!drawing && !hasPolygon) {
        startDrawing();
      }
    };

    window.addEventListener("map:activate-draw", handleActivateDraw);
    return () => window.removeEventListener("map:activate-draw", handleActivateDraw);
  }, [drawing, hasPolygon, startDrawing]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!drawing) return;
      const isUndo = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z";
      if (!isUndo) return;
      event.preventDefault();
      undoDrawPoint();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [drawing, undoDrawPoint]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (drawing) {
      map.doubleClickZoom.disable();
      return;
    }
    map.doubleClickZoom.enable();
  }, [drawing]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const setup = () => {
      ensureDrawSourceAndLayers(map);
    };

    const clickHandler = (event: maplibregl.MapMouseEvent) => {
      if (!drawing) return;
      const mapInstance = mapRef.current;
      if (!mapInstance || !ensureDrawSourceAndLayers(mapInstance)) return;

      drawPointsRef.current.push(event.lngLat);
      setDrawPointCount(drawPointsRef.current.length);
      syncDrawPreview(drawPointsRef.current);
    };

    const dblClickHandler = (event: maplibregl.MapMouseEvent) => {
      if (!drawing) return;
      event.preventDefault();
      finishDrawing();
    };

    if (map.isStyleLoaded()) {
      setup();
    } else {
      map.once("style.load", setup);
    }

    if (drawing) {
      map.getCanvas().style.cursor = "crosshair";
      map.on("click", clickHandler);
      map.on("dblclick", dblClickHandler);
      return () => {
        map.off("click", clickHandler);
        map.off("dblclick", dblClickHandler);
        map.off("style.load", setup);
      };
    }

    return () => {
      map.off("style.load", setup);
    };
  }, [drawing, ensureDrawSourceAndLayers, finishDrawing, syncDrawPreview]);

  useEffect(() => {
    if (drawing) return;
    if (mapRef.current?.getCanvas().style.cursor) {
      mapRef.current.getCanvas().style.cursor = "";
    }
    clearDrawing();
  }, [clearDrawing, drawing]);

  const mapCenter: [number, number] = center;

  const boundarySource = useMemo(() => {
    const features = parcels
      .map((parcel) => {
        const geometry = geometries.get(parcel.id)?.geometry;
        if (!isPolygonGeometry(geometry)) return null;

        const color = statusColorForParcel(parcel);
        const isSelected = effectiveSelectedIds.has(parcel.id);

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
  }, [parcels, geometries, effectiveSelectedIds]);

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
            selected: effectiveSelectedIds.has(parcel.id),
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
  }, [parcels, geometries, effectiveSelectedIds]);

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
            selected: effectiveSelectedIds.has(parcel.id),
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
  }, [parcels, geometries, effectiveSelectedIds]);

  const pointSource = useMemo(() => {
    const features = parcels
      .filter((parcel) => !geometries.has(parcel.id))
      .map((parcel) => {
        const color = statusColorForParcel(parcel);
        const isSelected = effectiveSelectedIds.has(parcel.id);

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
  }, [parcels, geometries, effectiveSelectedIds]);

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
    // Set ref BEFORE fitBounds: animate:false fires moveend synchronously,
    // which re-enters this function. Without this, the guard on line 843
    // sees stale ref and recurses until stack overflow.
    fittedBoundsRef.current = fitKey;
    map.fitBounds(bounds, { padding: 40, maxZoom: 15, animate: false });
  };

  useEffect(() => {
    if (mapRef.current || !mapContainerRef.current) return;

    let disposed = false;
    try {
      const map = new maplibregl.Map({
        container: mapContainerRef.current,
        center: mapCenter,
        zoom,
        keyboard: true,
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
            "parcel-tiles": {
              type: "vector",
              tiles: [getParcelTileUrl()],
              minzoom: 10,
              maxzoom: 22,
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
            "fema-flood-tiles": {
              type: "vector",
              tiles: [getMartinParcelTileUrl("fema_flood")],
              minzoom: 5,
              maxzoom: 22,
            },
            "soils-tiles": {
              type: "vector",
              tiles: [getMartinParcelTileUrl("soils")],
              minzoom: 5,
              maxzoom: 22,
            },
            "wetlands-tiles": {
              type: "vector",
              tiles: [getMartinParcelTileUrl("wetlands")],
              minzoom: 5,
              maxzoom: 22,
            },
            "epa-tiles": {
              type: "vector",
              tiles: [getMartinParcelTileUrl("epa_facilities")],
              minzoom: 5,
              maxzoom: 22,
            },
            "mobile-home-parks-tiles": {
              type: "vector",
              tiles: [getMartinParcelTileUrl("mobile_home_parks")],
              minzoom: 5,
              maxzoom: 22,
            },
            "zoning-tiles": {
              type: "vector",
              tiles: [getZoningProxyTileUrl()],
              minzoom: 10,
              maxzoom: 22,
            },
            "parcel-point-source": {
              type: "geojson",
              data: pointSource,
              cluster: true,
              clusterMaxZoom: 13,
              clusterRadius: 50,
            },
            "dark-carto": {
              type: "raster",
              tiles: DARK_BASE_TILES,
              tileSize: 256,
              attribution: "© CartoDB © OpenStreetMap",
            },
          },
          layers: [
            {
              id: "base-dark",
              type: "raster",
              source: "dark-carto",
              layout: { visibility: baseLayer === "Dark" ? "visible" : "none" },
            },
            {
              id: "base-streets",
              type: "raster",
              source: "streets",
              layout: {
                visibility: baseLayer === "Streets" ? "visible" : "none",
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
              id: "parcel-tiles-fill",
              type: "fill",
              source: "parcel-tiles",
              "source-layer": "ebr_parcels.1",
              layout: {
                visibility: showLayers && showParcelBoundaries ? "visible" : "none",
              },
              paint: {
                "fill-color": getParcelFillColor(parcelColorMode),
                "fill-opacity": getParcelFillOpacity(),
              },
            },
            {
              id: "parcel-tiles-line",
              type: "line",
              source: "parcel-tiles",
              "source-layer": "ebr_parcels.1",
              layout: {
                visibility: showLayers && showParcelBoundaries ? "visible" : "none",
              },
              paint: {
                "line-color": getParcelLineColor(parcelColorMode),
                "line-width": getParcelLineWidth(),
                "line-opacity": getParcelLineOpacity(),
              },
            },
            {
              id: "parcel-tiles-hover-outline",
              type: "line",
              source: "parcel-tiles",
              "source-layer": "ebr_parcels.1",
              layout: {
                visibility: showLayers && showParcelBoundaries ? "visible" : "none",
              },
              paint: {
                "line-color": "#ffffff",
                "line-width": [
                  "case",
                  ["boolean", ["feature-state", "hover"], false],
                  2.5,
                  0,
                ] as ExpressionSpecification,
                "line-opacity": 0.9,
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
              id: "zoning-tiles-fill",
              type: "fill",
              source: "zoning-tiles",
              "source-layer": "parcels",
              filter: ["has", "zoning_type"],
              layout: {
                visibility: showLayers && showZoning ? "visible" : "none",
              },
              paint: {
                "fill-color": buildZoningTileColorExpression("zoning_type"),
                "fill-opacity": [
                  "interpolate", ["linear"], ["zoom"],
                  10, 0.55,
                  13, 0.45,
                  16, 0.35,
                  22, 0.25,
                ],
                "fill-outline-color": buildZoningTileColorExpression("zoning_type"),
              },
            },
            {
              id: "fema-flood-tiles-fill",
              type: "fill",
              source: "fema-flood-tiles",
              "source-layer": "fema_flood",
              layout: {
                visibility: showLayers && showFlood ? "visible" : "none",
              },
              paint: {
                "fill-color": [
                  "match", ["get", "zone"],
                  "V", "rgba(220, 38, 38, 0.45)",
                  "VE", "rgba(220, 38, 38, 0.45)",
                  "A", "rgba(239, 68, 68, 0.35)",
                  "AE", "rgba(249, 115, 22, 0.35)",
                  "AH", "rgba(249, 115, 22, 0.35)",
                  "AO", "rgba(249, 115, 22, 0.35)",
                  "X", "transparent",
                  "OPEN WATER", "transparent",
                  "rgba(156, 163, 175, 0.15)",
                ],
                "fill-outline-color": [
                  "match", ["get", "zone"],
                  "V", "rgba(220, 38, 38, 0.6)",
                  "VE", "rgba(220, 38, 38, 0.6)",
                  "A", "rgba(239, 68, 68, 0.5)",
                  "AE", "rgba(249, 115, 22, 0.5)",
                  "AH", "rgba(249, 115, 22, 0.5)",
                  "AO", "rgba(249, 115, 22, 0.5)",
                  "transparent",
                ],
              },
            },
            {
              id: "soils-tiles-fill",
              type: "fill",
              source: "soils-tiles",
              "source-layer": "soils",
              layout: {
                visibility: showLayers && showSoils ? "visible" : "none",
              },
              paint: {
                "fill-color": [
                  "match", ["get", "hydric_rating"],
                  "Hydric", "#dc2626",
                  "Partially Hydric", "#f59e0b",
                  "Non-Hydric", "#16a34a",
                  "#9ca3af",
                ],
                "fill-opacity": 0.25,
              },
            },
            {
              id: "wetlands-tiles-fill",
              type: "fill",
              source: "wetlands-tiles",
              "source-layer": "wetlands",
              layout: {
                visibility: showLayers && showWetlands ? "visible" : "none",
              },
              paint: {
                "fill-color": "#3b82f6",
                "fill-opacity": 0.3,
                "fill-outline-color": "#2563eb",
              },
            },
            {
              id: "epa-tiles-circle",
              type: "circle",
              source: "epa-tiles",
              "source-layer": "epa_facilities",
              layout: {
                visibility: showLayers && showEpa ? "visible" : "none",
              },
              paint: {
                "circle-radius": [
                  "interpolate", ["linear"], ["get", "violations_count"],
                  0, 4,
                  10, 8,
                  50, 14,
                ],
                "circle-color": [
                  "interpolate", ["linear"], ["get", "violations_count"],
                  0, "#16a34a",
                  5, "#f59e0b",
                  20, "#dc2626",
                ],
                "circle-stroke-width": 1.5,
                "circle-stroke-color": "rgba(0, 0, 0, 0.5)",
                "circle-opacity": 0.8,
              },
            },
            {
              id: "mobile-home-parks-circle",
              type: "circle",
              source: "mobile-home-parks-tiles",
              "source-layer": "mobile_home_parks",
              layout: {
                visibility: showLayers && showMobileHomePark ? "visible" : "none",
              },
              paint: {
                "circle-radius": 6,
                "circle-color": "#8b5cf6",
                "circle-stroke-width": 2,
                "circle-stroke-color": "#ffffff",
                "circle-opacity": 0.8,
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
                "fill-opacity": [
                  "interpolate",
                  ["linear"],
                  ["zoom"],
                  10,
                  ["case", ["==", ["get", "selected"], true], 0.44, 0.24],
                  14,
                  ["case", ["==", ["get", "selected"], true], 0.36, 0.18],
                  18,
                  ["case", ["==", ["get", "selected"], true], 0.3, 0.12],
                ],
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
                "fill-opacity": [
                  "interpolate",
                  ["linear"],
                  ["zoom"],
                  9,
                  ["case", ["get", "selected"], 0.5, 0.32],
                  13,
                  ["case", ["get", "selected"], 0.42, 0.24],
                  18,
                  ["case", ["get", "selected"], 0.34, 0.16],
                ],
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
                "line-width": [
                  "interpolate",
                  ["linear"],
                  ["zoom"],
                  9,
                  ["case", ["get", "selected"], 3.4, 2.3],
                  14,
                  ["case", ["get", "selected"], 2.8, 1.9],
                  18,
                  ["case", ["get", "selected"], 2.2, 1.4],
                ],
                "line-opacity": [
                  "interpolate",
                  ["linear"],
                  ["zoom"],
                  9,
                  ["case", ["get", "selected"], 1, 0.95],
                  14,
                  ["case", ["get", "selected"], 1, 0.86],
                  18,
                  ["case", ["get", "selected"], 0.95, 0.76],
                ],
              },
            },
            {
              id: "parcel-clusters",
              type: "circle",
              source: "parcel-point-source",
              filter: ["has", "point_count"],
              layout: {
                visibility: showLayers ? "visible" : "none",
              },
              paint: {
                "circle-radius": [
                  "step",
                  ["get", "point_count"],
                  getParcelClusterRadius(10),
                  11,
                  getParcelClusterRadius(11),
                  51,
                  getParcelClusterRadius(51),
                ],
                "circle-color": "#1d4ed8",
                "circle-stroke-width": 2,
                "circle-stroke-color": "#dbeafe",
                "circle-opacity": 0.9,
              },
            },
            {
              id: "parcel-cluster-count",
              type: "symbol",
              source: "parcel-point-source",
              filter: ["has", "point_count"],
              layout: {
                visibility: showLayers ? "visible" : "none",
                "text-field": "{point_count_abbreviated}",
                "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
                "text-size": 12,
              },
              paint: {
                "text-color": "#ffffff",
              },
            },
            {
              id: "parcel-points",
              type: "circle",
              source: "parcel-point-source",
              filter: ["!", ["has", "point_count"]],
              minzoom: 11,
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

        // Globe projection + sky (must run after style is loaded)
        try {
          const mapWithProjection = map as maplibregl.Map & {
            setProjection?: (projection: string) => void;
          };
          mapWithProjection.setProjection?.("globe");
        } catch { /* globe not supported in this build */ }

        try {
          map.setSky({
            "sky-color": "#1a1a2e",
            "sky-horizon-blend": 0.5,
            "horizon-color": "#16213e",
            "horizon-fog-blend": 0.5,
            "fog-color": "#0f3460",
            "fog-ground-blend": 0.1,
          });
        } catch { /* sky not supported */ }

        map.resize();

        // Standard map controls
        map.addControl(
          new maplibregl.NavigationControl({ visualizePitch: true, showCompass: true }),
          "top-right",
        );
        map.addControl(
          new maplibregl.ScaleControl({ maxWidth: 100, unit: "imperial" }),
          "bottom-left",
        );

        setMapReady(true);
        onMapReadyRef.current?.();

        // Fix: MapLibre vector sources initialized below their minzoom can
        // get stuck with no tiles loaded even after zooming past minzoom.
        // Detect this and force-reload the source. Runs on load, moveend,
        // and a delayed check to catch all edge cases.
        const PARCEL_TILE_MINZOOM = 10;
        let parcelSourceReloaded = false;
        const forceReloadParcelSource = () => {
          try {
            const src = map.getSource("parcel-tiles");
            if (src && "setTiles" in src && typeof src.setTiles === "function") {
              src.setTiles([getParcelTileUrl()]);
            }
          } catch { /* non-critical */ }
        };
        const checkAndReloadTiles = () => {
          if (parcelSourceReloaded) return;
          const z = map.getZoom();
          if (z < PARCEL_TILE_MINZOOM) return;
          const features = map.queryRenderedFeatures(undefined, { layers: ["parcel-tiles-fill"] });
          if (features.length > 0) {
            parcelSourceReloaded = true;
            map.off("moveend", checkAndReloadTiles);
            return;
          }
          // No features at a zoom that should have them — force reload
          parcelSourceReloaded = true;
          map.off("moveend", checkAndReloadTiles);
          forceReloadParcelSource();
        };
        map.on("moveend", checkAndReloadTiles);
        // Run on load in case already at valid zoom
        checkAndReloadTiles();
        // Delayed check: covers the case where map loads at the boundary
        // and neither moveend nor zoomend fires
        setTimeout(() => checkAndReloadTiles(), 2000);

        const hideBoundaryLayerVisibility = () => {
          setLayerVisibilitySafe(map, "parcel-tiles-fill", showLayers && showParcelBoundaries);
          setLayerVisibilitySafe(map, "parcel-tiles-line", showLayers && showParcelBoundaries);
          setLayerVisibilitySafe(map, "parcel-tiles-hover-outline", showLayers && showParcelBoundaries);
          setLayerVisibilitySafe(map, "parcels-boundary-fill", showLayers && showParcelBoundaries);
          setLayerVisibilitySafe(map, "parcels-boundary-line", showLayers && showParcelBoundaries);
          setLayerVisibilitySafe(map, "parcels-zoning-layer", showLayers && showZoning && !zoningTileContract);
          setLayerVisibilitySafe(map, ZONING_TILE_LAYER_ID, showLayers && showZoning);
          setLayerVisibilitySafe(map, "parcels-flood-layer", showLayers && showFlood);
          setLayerVisibilitySafe(map, "fema-flood-tiles-fill", showLayers && showFlood);
          setLayerVisibilitySafe(map, "base-streets", baseLayer !== "Satellite");
          setLayerVisibilitySafe(map, "base-satellite", baseLayer === "Satellite");
          moveLayerBeforeSafe(map, "parcels-boundary-fill", "parcels-zoning-layer");
          moveLayerBeforeSafe(map, "parcels-boundary-fill", ZONING_TILE_LAYER_ID);
          moveLayerBeforeSafe(map, ZONING_TILE_LAYER_ID, ZONING_TILE_INSERT_BEFORE_LAYER_ID);
        };

        hideBoundaryLayerVisibility();
        fitBounds();

        const removeInteractionHandlers = bindMapInteractionHandlers({
          map,
          fitBounds,
          onParcelClick: stableMapCallbacks.onParcelClick,
          updateSelection,
          getParcelById: (parcelId) => parcelByIdRef.current.get(parcelId),
          openParcelPopup: (parcel, _lngLat, point) => {
            popupRef.current?.remove();
            popupRef.current = null;
            setHoveredParcel(null);
            setHoverPoint(null);
            setDetailCardParcel(parcel);
            setDetailCardPoint(point ?? null);
          },
          openTilePopup: (properties, lngLat) => {
            if (!mapRef.current) {
              return;
            }
            setHoveredParcel(null);
            setHoverPoint(null);
            closeParcelDetailCard();
            presentMapPopup({
              map: mapRef.current,
              popupRef,
              lngLat,
              viewModel: buildTileParcelPopupViewModel(properties),
            });
          },
          onParcelHover: (parcel, _lngLat, point) => {
            setHoveredParcel(parcel);
            setHoverPoint(point);
          },
          onParcelHoverEnd: () => {
            setHoveredParcel(null);
            setHoverPoint(null);
          },
          setCursor: (lng, lat) => {
            setCursorLng(lng);
            setCursorLat(lat);
          },
          setZoom: setCurrentZoom,
          setViewportBounds,
          onViewStateChange: onViewStateChangeRef.current,
          boundsTimerRef,
        });

        map.once("remove", removeInteractionHandlers);
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
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
      setMapReady(false);
      if (mapRef.current) {
        clearTemporaryLayers();
        popupRef.current?.remove();
        popupRef.current = null;
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [clearTemporaryLayers, handlePopupAction, updateSelection]);

  // Sync zoom prop to existing map — covers the case where MapChatContext
  // updates the zoom (e.g., clamping a too-low cached value) after the map
  // was already created at the old zoom.
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    const currentZoom = mapRef.current.getZoom();
    if (typeof zoom === "number" && Math.abs(currentZoom - zoom) > 0.5) {
      mapRef.current.jumpTo({ zoom });
    }
  }, [zoom, mapReady]);

  // Keep MapLibre canvas sized to its container when layout shifts (sidebar
  // toggle, operator console show/hide, window resize, etc.).
  useEffect(() => {
    const map = mapRef.current;
    const container = mapContainerRef.current;
    if (!map || !container || !mapReady) return;
    const updateContainerSize = () => {
      setContainerSize({
        width: container.clientWidth,
        height: container.clientHeight,
      });
    };
    updateContainerSize();
    const ro = new ResizeObserver(() => {
      map.resize();
      updateContainerSize();
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [mapReady]);

  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    const map = mapRef.current;
    const appliedContractKey = appliedZoningTileContractKeyRef.current;
    const nextContractKey = zoningTileContract
      ? `${zoningTileContract.sourceId}:${zoningTileContract.sourceLayer}:${zoningTileContract.propertyName}`
      : null;

    const removeZoningTileArtifacts = () => {
      if (map.getLayer(ZONING_TILE_LAYER_ID)) {
        map.removeLayer(ZONING_TILE_LAYER_ID);
      }
      if (map.getSource(ZONING_TILE_SOURCE_KEY)) {
        map.removeSource(ZONING_TILE_SOURCE_KEY);
      }
      appliedZoningTileContractKeyRef.current = null;
    };

    try {

      if (!zoningTileContract) {
        removeZoningTileArtifacts();
        moveLayerBeforeSafe(map, "parcels-boundary-fill", "parcels-zoning-layer");
        return;
      }

      if (appliedContractKey !== nextContractKey) {
        removeZoningTileArtifacts();
        map.addSource(ZONING_TILE_SOURCE_KEY, buildZoningTileSource(zoningTileContract));
        map.addLayer(
          buildZoningTileLayer(zoningTileContract, showLayers && showZoning),
          "parcels-zoning-layer",
        );
        appliedZoningTileContractKeyRef.current = nextContractKey;
      }

      setLayerVisibilitySafe(map, ZONING_TILE_LAYER_ID, showLayers && showZoning);

      // Dim parcel boundaries when zoning overlay is active for visual clarity
      const zoningActive = showLayers && showZoning && !!zoningTileContract;
      if (map.getLayer("parcel-tiles-fill")) {
        map.setPaintProperty("parcel-tiles-fill", "fill-opacity", zoningActive ? 0.02 : getParcelFillOpacity());
      }
      if (map.getLayer("parcel-tiles-line")) {
        map.setPaintProperty("parcel-tiles-line", "line-opacity", zoningActive ? 0.3 : getParcelLineOpacity());
        map.setPaintProperty("parcel-tiles-line", "line-color", zoningActive ? "#a3a3a3" : getParcelLineColor(parcelColorMode));
      }

      // Ensure zoning-tiles-fill is above parcel outlines
      moveLayerBeforeSafe(map, "parcel-tiles-line", ZONING_TILE_LAYER_ID);
    } catch {
      removeZoningTileArtifacts();
    }
  }, [mapReady, showLayers, showZoning, zoningTileContract]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    try {
      if (map.getLayer("parcel-tiles-fill")) {
        map.setPaintProperty("parcel-tiles-fill", "fill-color", getParcelFillColor(parcelColorMode));
      }
      if (map.getLayer("parcel-tiles-line")) {
        map.setPaintProperty("parcel-tiles-line", "line-color", getParcelLineColor(parcelColorMode));
      }
    } catch { /* layer may not exist yet */ }
  }, [parcelColorMode, mapReady]);

  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    const map = mapRef.current;
    setGeoJsonSourceDataSafe(map, "parcel-boundary-source", boundarySource);
    setGeoJsonSourceDataSafe(map, "parcel-zoning-source", zoningSource);
    setGeoJsonSourceDataSafe(map, "parcel-flood-source", floodSource);
    setGeoJsonSourceDataSafe(map, "parcel-point-source", pointSource);

    setLayerVisibilitySafe(map, "parcel-tiles-fill", showLayers && showParcelBoundaries);
    setLayerVisibilitySafe(map, "parcel-tiles-line", showLayers && showParcelBoundaries);
    setLayerVisibilitySafe(map, "parcels-boundary-fill", showLayers && showParcelBoundaries);
    setLayerVisibilitySafe(map, "parcels-boundary-line", showLayers && showParcelBoundaries);
    setLayerVisibilitySafe(map, "parcels-zoning-layer", showLayers && showZoning && !zoningTileContract);
    setLayerVisibilitySafe(map, ZONING_TILE_LAYER_ID, showLayers && showZoning);
    setLayerVisibilitySafe(map, "parcels-flood-layer", showLayers && showFlood);
    setLayerVisibilitySafe(map, "fema-flood-tiles-fill", showLayers && showFlood);
    setLayerVisibilitySafe(map, "soils-tiles-fill", showLayers && showSoils);
    setLayerVisibilitySafe(map, "wetlands-tiles-fill", showLayers && showWetlands);
    setLayerVisibilitySafe(map, "epa-tiles-circle", showLayers && showEpa);
    setLayerVisibilitySafe(map, "mobile-home-parks-circle", showLayers && showMobileHomePark);
    setLayerVisibilitySafe(map, "base-dark", baseLayer === "Dark");
    setLayerVisibilitySafe(map, "base-streets", baseLayer === "Streets");
    setLayerVisibilitySafe(map, "base-satellite", baseLayer === "Satellite");
    setLayerVisibilitySafe(map, "parcel-clusters", showLayers);
    setLayerVisibilitySafe(map, "parcel-cluster-count", showLayers);
    setLayerVisibilitySafe(map, "parcel-points", showLayers);
    // Ensure zoning-tiles-fill is above parcel outlines
    moveLayerBeforeSafe(map, "parcel-tiles-line", ZONING_TILE_LAYER_ID);
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
    showSoils,
    showWetlands,
    showEpa,
    baseLayer,
    isDark,
    effectiveSelectedIds,
    zoningTileContract,
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
          "Soils": showSoils,
          "Wetlands": showWetlands,
          "EPA Facilities": showEpa,
          "Mobile Home Parks": showMobileHomePark,
        })
      );
    } catch {
      // Ignore localStorage write failures for display preferences.
    }
  }, [baseLayer, showParcelBoundaries, showZoning, showFlood, showSoils, showWetlands, showEpa, showMobileHomePark, mapReady]);

  if (mapError) {
    return (
      <div
        className="flex h-full w-full items-center justify-center rounded-lg border border-map-border bg-red-500/10 text-sm text-red-400"
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
      <div ref={mapContainerRef} style={{ height, width: "100%", backgroundColor: "#1e2230" }} />
      <MapGeocoder
        mapRef={mapRef}
        parcels={parcels}
        onPlaceSelect={handlePlaceSelect}
      />
      <ParcelHoverTooltip
        parcel={hoveredParcel}
        point={hoverPoint}
        containerSize={containerSize}
      />
      <ParcelDetailCard
        parcel={detailCardParcel}
        point={detailCardPoint}
        containerSize={containerSize}
        onClose={closeParcelDetailCard}
        onAction={handlePopupAction}
      />
      {showLayers ? (
        <MapWorkbenchPanel
          open={layerPanelOpen}
          searchSlot={searchSlot}
          baseLayer={baseLayer}
          onBaseLayerChange={setBaseLayer}
          activePreset={activeWorkbenchPreset}
          onApplyPreset={applyWorkbenchPreset}
          geometryStatusLabel={geometryStatusLabel}
          showParcelBoundaries={showParcelBoundaries}
          setShowParcelBoundaries={setShowParcelBoundaries}
          showZoning={showZoning}
          setShowZoning={setShowZoning}
          showFlood={showFlood}
          setShowFlood={setShowFlood}
          showSoils={showSoils}
          setShowSoils={setShowSoils}
          showWetlands={showWetlands}
          setShowWetlands={setShowWetlands}
          showEpa={showEpa}
          setShowEpa={setShowEpa}
          showMobileHomePark={showMobileHomePark}
          setShowMobileHomePark={setShowMobileHomePark}
          showRecentSales={showRecentSales}
          setShowRecentSales={setShowRecentSales}
          showNewPermits={showNewPermits}
          setShowNewPermits={setShowNewPermits}
          showZoningChanges={showZoningChanges}
          setShowZoningChanges={setShowZoningChanges}
          show3DExtrusions={show3DExtrusions}
          setShow3DExtrusions={setShow3DExtrusions}
          showTools={showTools}
          showComps={showComps}
          setShowComps={setShowComps}
          showHeatmap={showHeatmap}
          setShowHeatmap={setShowHeatmap}
          activeHeatmapPreset={activeHeatmapPreset}
          setActiveHeatmapPreset={setActiveHeatmapPreset}
          showIsochrone={showIsochrone}
          setShowIsochrone={setShowIsochrone}
          measureMode={measureMode}
          setMeasureMode={setMeasureMode}
          drawing={drawing}
          hasPolygon={hasPolygon}
          drawState={drawState}
          selectedCount={effectiveSelectedIds.size}
          onToggleOpen={() => setLayerPanelOpen((open) => !open)}
          onScreenshot={downloadMapScreenshot}
          onToggleFullscreen={toggleMapFullscreen}
          onToggleDrawing={toggleDrawing}
          onUndoDraw={undoDrawPoint}
          onCancelDraw={cancelDrawing}
          onClearPolygon={clearPolygonSelection}
          polygon={polygon}
          onPolygonDrawn={onPolygonDrawn}
          onOpenCompare={() => setCompareOpen(true)}
          onOpenSplitMap={() => setSplitMapOpen(true)}
          dataFreshnessLabel={dataFreshnessLabel}
          latencyLabel={latencyLabel}
        />
      ) : null}

      {/* Color mode control */}
      {showLayers && showParcelBoundaries && (
        <div className="absolute bottom-24 right-3 z-10">
          <ParcelColorModeControl value={parcelColorMode} onChange={setParcelColorMode} />
        </div>
      )}

      {/* Layer legend */}
      {showLayers && (
        <MapLegend
          showParcelBoundaries={showParcelBoundaries}
          showZoning={showZoning}
          showFlood={showFlood}
          showSoils={showSoils}
          showWetlands={showWetlands}
          showEpa={showEpa}
          showMobileHomePark={showMobileHomePark}
          parcelColorMode={parcelColorMode}
        />
      )}

      {/* Status bar with coordinates and zoom */}
      {showLayers ? (
        <div className="map-status-bar absolute inset-x-3 bottom-3 z-10 flex items-center justify-between gap-3 rounded-2xl border border-map-border/80 bg-map-surface-overlay/92 px-3 py-2 text-[11px] shadow-[0_18px_50px_-32px_rgba(15,23,42,0.55)] backdrop-blur-md">
          <div className="flex min-w-0 items-center gap-2 text-map-text-muted">
            {showLiveStatus ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-map-border/70 bg-map-surface/55 px-2 py-1 text-[10px] text-map-text-secondary">
                <span
                  aria-hidden="true"
                  className={cn(
                    "h-2 w-2 rounded-full",
                    mapReady ? "bg-emerald-400 shadow-[0_0_0_4px_rgba(52,211,153,0.16)]" : "bg-amber-400",
                  )}
                />
                {mapReady ? "Live" : "Syncing"}
              </span>
            ) : null}
            <span className="truncate">{formattedCursor}</span>
          </div>
          <div className="flex flex-1 items-center justify-center text-map-text-muted">
            {lastDrawnMeasureLabel ? `Area ${lastDrawnMeasureLabel}` : "Parcels live on the active view"}
          </div>
          <div className="shrink-0 text-map-text-muted">Zoom {currentZoom.toFixed(2)}</div>
        </div>
      ) : null}
      {polygon && (
        <MapLibrePolygonOverlay map={mapRef.current} polygon={polygon} mapReady={mapReady} />
      )}
      {(trajectoryData?.features?.length ?? 0) > 0 && (
        <MapLibreTrajectoryLayer
          map={mapRef.current}
          trajectoryData={trajectoryData as { type: "FeatureCollection"; features: unknown[] }}
          mapReady={mapReady}
        />
      )}
      {showTools && (
        <>
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
            presetKey={activeHeatmapPreset}
          />
          <MapLibreIsochroneControl
            map={mapRef.current}
            parcels={parcels}
            visible={showIsochrone}
          />
          <MapLibre3DExtrusionLayer
            map={mapRef.current}
            visible={show3DExtrusions}
          />
        </>
      )}
      <ParcelComparisonSheet
        open={compareOpen}
        parcels={selectedParcelsForCompare}
        onClose={() => setCompareOpen(false)}
      />
      <SplitMapCompare
        open={splitMapOpen}
        onClose={() => setSplitMapOpen(false)}
        center={
          mapRef.current
            ? [mapRef.current.getCenter().lng, mapRef.current.getCenter().lat]
            : undefined
        }
        zoom={mapRef.current?.getZoom()}
        leftLabel="Satellite"
        rightLabel="Zoning Overlay"
        leftLayers={["parcels"]}
        rightLayers={["parcels", "zoning"]}
      />
      {showTools && mapReady && <MapTour />}
    </div>
  );
});

function MapLibrePolygonOverlay({
  map,
  polygon,
  mapReady,
}: {
  map: maplibregl.Map | null;
  polygon: number[][][] | null;
  mapReady: boolean;
}) {
  const mapRef = useRef(map);
  const sourceId = "polygon-overlay-source";
  const fillId = "polygon-overlay-fill";
  const lineId = "polygon-overlay-line";

  useEffect(() => {
    mapRef.current = map;
  }, [map]);

  const data = useMemo(() => {
    if (!polygon?.[0]?.length) return { type: "FeatureCollection" as const, features: [] };
    const ring = polygon[0];
    if (ring.length < 4) return { type: "FeatureCollection" as const, features: [] };
    return {
      type: "FeatureCollection" as const,
      features: [
        {
          type: "Feature" as const,
          geometry: { type: "Polygon" as const, coordinates: [ring] },
          properties: {},
        },
      ],
    };
  }, [polygon]);

  useEffect(() => {
    const m = mapRef.current;
    if (!m || !mapReady || !m.isStyleLoaded()) return;

    if (!getGeoJsonSourceSafe(m, sourceId)) {
      try {
        m.addSource(sourceId, { type: "geojson", data });
      } catch {
        return;
      }
      if (!m.getLayer(fillId)) {
        m.addLayer({
          id: fillId,
          type: "fill",
          source: sourceId,
          paint: { "fill-color": MAP_DRAW_ACCENT_COLOR, "fill-opacity": 0.1 },
        });
      }
      if (!m.getLayer(lineId)) {
        m.addLayer({
          id: lineId,
          type: "line",
          source: sourceId,
          paint: {
            "line-color": MAP_DRAW_ACCENT_COLOR,
            "line-width": 2,
            "line-dasharray": [4, 2],
          },
        });
      }
    }
    setGeoJsonSourceDataSafe(m, sourceId, data);
  }, [mapReady, data]);

  return null;
}

function MapLibreTrajectoryLayer({
  map,
  trajectoryData,
  mapReady,
}: {
  map: maplibregl.Map | null;
  trajectoryData: { type: "FeatureCollection"; features: unknown[] } | null;
  mapReady: boolean;
}) {
  const mapRef = useRef(map);
  const sourceId = "trajectory-source";
  const fillId = "trajectory-fill";
  const lineId = "trajectory-line";

  useEffect(() => {
    mapRef.current = map;
  }, [map]);

  const hasData =
    trajectoryData?.type === "FeatureCollection" &&
    Array.isArray(trajectoryData.features) &&
    trajectoryData.features.length > 0;

  useEffect(() => {
    const m = mapRef.current;
    if (!m || !mapReady) return;

    if (!hasData) {
      setGeoJsonSourceDataSafe(m, sourceId, {
        type: "FeatureCollection",
        features: [],
      });
      return;
    }

    const data = trajectoryData as GeoJSON.FeatureCollection;

    if (!getGeoJsonSourceSafe(m, sourceId)) {
      m.addSource(sourceId, { type: "geojson", data });
      m.addLayer({
        id: fillId,
        type: "fill",
        source: sourceId,
        filter: ["in", ["geometry-type"], ["literal", ["Polygon", "MultiPolygon"]]],
        paint: {
          "fill-color": [
            "match",
            ["get", "velocity_of_change"],
            0, "#FFEDA0",
            15, "#FD8D3C",
            30, "#FC4E2A",
            50, "#E31A1C",
            70, "#BD0026",
            90, "#800026",
            "#e5e7eb",
          ],
          "fill-opacity": 0.65,
        },
      });
      m.addLayer({
        id: lineId,
        type: "line",
        source: sourceId,
        filter: ["in", ["geometry-type"], ["literal", ["Polygon", "MultiPolygon"]]],
        paint: {
          "line-color": "#ffffff",
          "line-width": 2,
        },
      });
    } else {
      setGeoJsonSourceDataSafe(m, sourceId, data);
    }
  }, [mapReady, hasData, trajectoryData]);

  return null;
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
    setGeoJsonSourceDataSafe(mapRef.current, sourceId, {
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

      if (!getGeoJsonSourceSafe(mapInstance, sourceId)) {
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

      setGeoJsonSourceDataSafe(mapInstance, sourceId, buildFeatures(points));
      recalculate(points);
    };

    const clickHandler = (event: maplibregl.MapMouseEvent) => {
      if (mode === "off" || !mapLoadedRef.current) return;
      const next = [...points, event.lngLat];
      setPoints(next);
      setGeoJsonSourceDataSafe(mapInstance, sourceId, buildFeatures(next));
      recalculate(next);
    };

    if (mapInstance.isStyleLoaded()) {
      setup();
    } else {
      mapInstance.once("style.load", setup);
    }
    mapInstance.on("click", clickHandler);

    return () => {
      mapInstance.off("click", clickHandler);
      mapInstance.off("style.load", setup);
      if (mode === "off") {
        setGeoJsonSourceDataSafe(mapInstance, sourceId, {
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
      className="absolute right-16 top-2 z-10 rounded-md border border-map-border map-panel p-2 text-xs shadow-lg"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="mb-1 flex items-center justify-between gap-1">
        <div className="text-xs font-semibold uppercase text-map-text-muted">
          {mode === "distance" ? "Distance" : "Area"}
        </div>
        <div className="flex gap-1">
          <button
            className="rounded px-1 text-map-text-muted hover:text-map-text-primary"
            onClick={clear}
            title="Clear"
          >
            ⟲
          </button>
          <button
            className="rounded px-1 text-map-text-muted hover:text-map-text-primary"
            onClick={() => setMode("off")}
            title="Close"
          >
            ✕
          </button>
        </div>
      </div>
      <div className="text-lg font-bold text-map-text-primary">
        {mode === "distance"
          ? totalDistance > 0
            ? formatDistance(totalDistance)
            : "Click map to start"
          : totalArea > 0
            ? formatArea(totalArea)
            : `${points.length < 3 ? `${points.length}/3 points` : "Click to add points"}`}
      </div>
      <div className="mt-1 text-[10px] text-map-text-muted">
        {mode === "distance" ? "Click map to add waypoints" : "Click map to define area"}
      </div>
      <div className="mt-1 flex gap-1.5">
        <button
          onClick={() => setMode("distance")}
          className={`rounded px-2 py-0.5 text-[10px] ${mode === "distance" ? "bg-blue-500 text-white" : "bg-map-surface text-map-text-muted"}`}
        >
          Distance
        </button>
        <button
          onClick={() => setMode("area")}
          className={`rounded px-2 py-0.5 text-[10px] ${mode === "area" ? "bg-blue-500 text-white" : "bg-map-surface text-map-text-muted"}`}
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
    setGeoJsonSourceDataSafe(mapRef.current, sourceId, {
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
        // Comp fetch failures should not block the rest of the map surface.
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
      setGeoJsonSourceDataSafe(mapInstance, sourceId, {
        type: "FeatureCollection",
        features: [],
      });
      if (mapInstance.getLayer(layerId)) {
        mapInstance.setLayoutProperty(layerId, "visibility", "none");
      }
      if (mapInstance.getLayer(labelLayerId)) {
        mapInstance.setLayoutProperty(labelLayerId, "visibility", "none");
      }
      return;
    }

    const setupComps = () => {
      if (!getGeoJsonSourceSafe(mapInstance, sourceId)) {
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
          const safeAddress = escapeHtml(comp.address);
          const safeSalePrice = comp.salePrice != null ? escapeHtml(formatCurrency(comp.salePrice)) : null;
          const safePricePerAcre = comp.pricePerAcre != null
            ? escapeHtml(formatCurrency(comp.pricePerAcre))
            : null;
          const safePricePerSf = comp.pricePerSf != null
            ? escapeHtml(comp.pricePerSf.toFixed(2))
            : null;
          const safeAcreage = comp.acreage != null ? escapeHtml(comp.acreage.toFixed(2)) : null;
          const safeSaleDate = comp.saleDate != null
            ? escapeHtml(new Date(comp.saleDate).toLocaleDateString())
            : null;
          const safeRecency = comp.saleDate != null ? escapeHtml(getRecencyLabel(comp.saleDate)) : null;
          const safeUseType = comp.useType ? escapeHtml(comp.useType) : null;

          popupRef.current = new maplibregl.Popup({ closeOnClick: true })
            .setLngLat([event.lngLat.lng, event.lngLat.lat])
            .setHTML(`<div style="font-size:13px;line-height:1.4">
            <div style="font-weight:600;margin-bottom:2px;">${safeAddress}</div>
            ${safeSalePrice != null ? `<div style="font-size:14px;font-weight:700;color:#1e40af;">${safeSalePrice}</div>` : ""}
            ${safePricePerAcre != null ? `<div style="font-size:11px;">${safePricePerAcre} / acre</div>` : ""}
            ${safePricePerSf != null ? `<div style="font-size:11px;">$${safePricePerSf} / SF</div>` : ""}
            ${safeAcreage != null ? `<div style="font-size:11px;">${safeAcreage} acres</div>` : ""}
            ${safeSaleDate != null ? `<div style="font-size:11px;color:#6b7280;">Sold: ${safeSaleDate}${safeRecency ? ` (${safeRecency})` : ""}</div>` : ""}
            ${safeUseType ? `<div style="font-size:11px;color:#6b7280;">Use: ${safeUseType}</div>` : ""}
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
        setGeoJsonSourceDataSafe(mapInstance, sourceId, compSource);
      }
      if (mapInstance.getLayer(layerId)) {
        mapInstance.setLayoutProperty(layerId, "visibility", "visible");
      }
      if (mapInstance.getLayer(labelLayerId)) {
        mapInstance.setLayoutProperty(labelLayerId, "visibility", "visible");
      }
    };

    if (mapInstance.isStyleLoaded()) {
      setupComps();
    } else {
      mapInstance.once("style.load", setupComps);
    }

    if (visible && centerLat != null && centerLng != null && !searched) {
      searchComps(centerLat, centerLng);
    }

    return () => {
      mapInstance.off("style.load", setupComps);
    };
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
      className="absolute right-16 top-2 z-10 rounded-md border border-map-border map-panel p-2 text-xs shadow-lg"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="font-semibold text-map-text-muted uppercase text-[11px]">Comparable Sales</div>
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
          className="min-w-0 flex-1 rounded border border-map-border bg-map-surface px-2 py-1 text-xs text-map-text-primary placeholder:text-map-text-muted"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded bg-blue-500 px-2 py-1 text-xs text-white disabled:opacity-50"
        >
          {loading ? "..." : "Search"}
        </button>
      </form>
      {searched && <p className="mt-1 text-[10px] text-map-text-muted">{comps.length} comp{comps.length !== 1 ? "s" : ""} found</p>}
      <div className="mt-2 flex gap-2 text-[10px] text-map-text-muted">
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
  presetKey?: HeatmapPresetKey;
  compData?: SaleComp[];
}

function MapLibreHeatmapLayer({
  map,
  parcels,
  visible,
  presetKey = "sale_activity",
  compData,
}: MapLibreHeatmapLayerProps) {
  const mapRef = useRef(map);
  const sourceId = "maplibre-heatmap-source";
  const layerId = "maplibre-heatmap-layer";
  const preset = HEATMAP_PRESET_MAP[presetKey];

  useEffect(() => {
    mapRef.current = map;
  }, [map]);

  const heatSource = useMemo(
    () =>
      preset.buildSource(parcels, compData) as GeoJSON.FeatureCollection<
        GeoJSON.Point,
        HeatPointProperties
      >,
    [preset, parcels, compData]
  );

  useEffect(() => {
    const mapInstance = mapRef.current;
    if (!mapInstance) return;

    if (!visible) {
      if (mapInstance.getLayer(layerId)) {
        mapInstance.setLayoutProperty(layerId, "visibility", "none");
      }
      return;
    }

    const setupHeat = () => {
      if (!getGeoJsonSourceSafe(mapInstance, sourceId)) {
        mapInstance.addSource(sourceId, {
          type: "geojson",
          data: heatSource,
        });
        mapInstance.addLayer({
          id: layerId,
          type: "heatmap",
          source: sourceId,
          paint: preset.paint,
        });
      } else {
        setGeoJsonSourceDataSafe(mapInstance, sourceId, heatSource);
      }
      if (mapInstance.getLayer(layerId)) {
        mapInstance.setLayoutProperty(layerId, "visibility", "visible");
      }
    };

    if (mapInstance.isStyleLoaded()) {
      setupHeat();
    } else {
      mapInstance.once("style.load", setupHeat);
    }

    return () => {
      mapInstance.off("style.load", setupHeat);
    };
  }, [visible, heatSource, preset]);

  useEffect(() => {
    const mapInstance = mapRef.current;
    if (!mapInstance || !visible) return;
    if (!mapInstance.getLayer(layerId)) return;
    try {
      for (const [key, value] of Object.entries(preset.paint ?? {})) {
        mapInstance.setPaintProperty(layerId, key, value);
      }
    } catch {
      // Ignore paint update failures during transient style reloads.
    }
  }, [preset, visible, layerId]);

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
  const visibleRef = useRef(visible);
  const clickModeRef = useRef(clickMode);
  const minutesRef = useRef(minutes);
  const sourceId = "maplibre-isochrone-source";
  const lineId = "maplibre-isochrone-line";
  const fillId = "maplibre-isochrone-fill";
  const centerSourceId = "maplibre-isochrone-center-source";
  const centerLayerId = "maplibre-isochrone-center-layer";

  useEffect(() => {
    mapRef.current = map;
  }, [map]);

  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);

  useEffect(() => {
    clickModeRef.current = clickMode;
  }, [clickMode]);

  useEffect(() => {
    minutesRef.current = minutes;
  }, [minutes]);

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
      if (!visibleRef.current || !clickModeRef.current) return;
      compute(event.lngLat.lat, event.lngLat.lng, minutesRef.current);

      setGeoJsonSourceDataSafe(mapInstance, centerSourceId, {
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

    const setupIsochrone = () => {
      if (!getGeoJsonSourceSafe(mapInstance, sourceId)) {
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

        if (!getGeoJsonSourceSafe(mapInstance, centerSourceId)) {
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
      }

      mapInstance.off("click", handleMapClick);
      mapInstance.on("click", handleMapClick);
    };

    if (mapInstance.isStyleLoaded()) {
      setupIsochrone();
    } else {
      mapInstance.once("style.load", setupIsochrone);
    }

    return () => {
      mapInstance.off("click", handleMapClick);
      mapInstance.off("style.load", setupIsochrone);
    };
  }, [visible, compute, clearResult]);

  useEffect(() => {
    const mapInstance = mapRef.current;
    const source = getGeoJsonSourceSafe(mapInstance, sourceId);
    const centerSource = getGeoJsonSourceSafe(mapInstance, centerSourceId);
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
      className="absolute right-2 bottom-16 z-10 rounded-md border border-map-border map-panel p-2 text-xs shadow-lg"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-map-text-muted text-[11px] font-semibold uppercase">
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
            className="text-map-text-muted hover:text-map-text-primary"
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
            className={`rounded px-1.5 py-1 text-xs ${minutes === t ? "bg-purple-500 text-white" : "bg-map-surface text-map-text-muted hover:bg-map-surface/80"}`}
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
        <div className="mt-1.5 rounded bg-purple-500/10 px-2 py-1.5 text-xs">
          <div className="font-semibold text-purple-300">{result.minutes}-min drive area</div>
          <div className="text-purple-400">{result.parcelCount} parcel{result.parcelCount !== 1 ? "s" : ""} in range</div>
        </div>
      )}
      {error && (
        <div className="mt-1.5 rounded bg-red-500/10 px-2 py-1.5 text-xs text-red-400">
          {error}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3D Parcel Extrusion Layer
// ---------------------------------------------------------------------------

function MapLibre3DExtrusionLayer({
  map,
  visible,
}: {
  map: maplibregl.Map | null;
  visible: boolean;
}) {
  const mapRef = useRef(map);
  const sourceId = "parcel-extrusion-source";
  const layerId = "parcel-extrusion-3d";

  useEffect(() => {
    mapRef.current = map;
  }, [map]);

  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;

    if (!visible) {
      if (m.getLayer(layerId)) {
        m.setLayoutProperty(layerId, "visibility", "none");
      }
      // Reset pitch when 3D is turned off
      if (m.getPitch() > 0) {
        m.easeTo({ pitch: 0, duration: 600 });
      }
      return;
    }

    const setup = () => {
      // Add the parcel tiles as a vector source if not already present
      if (!m.getSource(sourceId)) {
        m.addSource(sourceId, {
          type: "vector",
          tiles: [getMartinParcelTileUrl("ebr_parcels")],
          minzoom: 12,
          maxzoom: 22,
        });
      }

      if (!m.getLayer(layerId)) {
        m.addLayer({
          id: layerId,
          type: "fill-extrusion",
          source: sourceId,
          "source-layer": "ebr_parcels.1",
          minzoom: 12,
          paint: {
            "fill-extrusion-height": [
              "interpolate",
              ["linear"],
              ["coalesce", ["get", "lot_area_sqft"], 5000],
              0, 5,
              5000, 20,
              20000, 60,
              50000, 120,
              200000, 200,
              500000, 300,
            ],
            "fill-extrusion-base": 0,
            "fill-extrusion-color": [
              "match",
              ["coalesce", ["get", "zoning_type"], ""],
              "M1", "#f97316",
              "M2", "#ea580c",
              "M3", "#c2410c",
              "C1", "#8b5cf6",
              "C2", "#7c3aed",
              "C3", "#6d28d9",
              "C4", "#5b21b6",
              "C5", "#4c1d95",
              "A1", "#22c55e",
              "A2", "#16a34a",
              "A3", "#15803d",
              "A4", "#166534",
              "A5", "#14532d",
              "#facc15",
            ],
            "fill-extrusion-opacity": 0.75,
          },
        });
      }

      m.setLayoutProperty(layerId, "visibility", "visible");

      // Auto-pitch for 3D view
      if (m.getPitch() < 45) {
        m.easeTo({ pitch: 55, duration: 800 });
      }
    };

    if (m.isStyleLoaded()) {
      setup();
    } else {
      m.once("style.load", setup);
    }

    return () => {
      m.off("style.load", setup);
    };
  }, [visible]);

  return null;
}
