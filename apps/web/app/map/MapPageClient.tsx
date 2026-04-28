"use client";

import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Loader2 } from "lucide-react";
import {
  summarizeTrackedParcels,
  type MapTrackedParcel,
} from "@/components/maps/mapOperatorNotebook";
import type { MapHudState, MapParcel } from "@/components/maps/types";
import { useOverlayState } from "@/components/maps/hooks/useOverlayState";
import { useMapInvestorWorkbench } from "@/components/maps/useMapInvestorWorkbench";
import { useMapTrackedParcelWorkspace } from "@/components/maps/useMapTrackedParcelWorkspace";
import { recordClientMetricEvent } from "@/components/observability/client-telemetry";
import { useIsMobile } from "@/hooks/useIsMobile";
import {
  buildMapContextInput,
  useMapChatDispatch,
  useMapChatState,
} from "@/lib/chat/MapChatContext";
import type { MapActionPayload, MapFeature } from "@/lib/chat/mapActionTypes";
import { mapFeaturesFromGeoJson } from "@/lib/chat/mapFeatureUtils";
import { normalizeParcelId } from "@/lib/maps/parcelIdentity";
import { useUIStore } from "@/stores/uiStore";
import {
  buildSuggestionLookupText,
  isLikelyMapAnalysisQuery,
  isLikelyParcelLookupQuery,
  parcelMatchesSearch,
  resolveSuggestionParcel,
  type ParcelSearchSuggestion,
} from "./searchHelpers";
import {
  requestProspectParcels,
  requestViewportParcels,
} from "./viewportParcelData";
import {
  extractNlQueryFinalText,
  extractNlQueryRows,
  extractNlQueryTextDelta,
} from "./nlQueryStream";
import {
  AtlasTopChrome,
  AtlasStatusStrip,
  AtlasLeftRail,
  AtlasToolRail,
  AtlasHud,
  AtlasPolygonCard,
} from "@/components/maps/atlas";
import type { ParcelMapRef } from "@/components/maps/ParcelMap";

const AtlasFeedPanel = dynamic(
  () =>
    import("@/components/maps/feed/AtlasFeedPanel").then(
      (m) => m.AtlasFeedPanel,
    ),
  { ssr: false },
);

const ParcelMap = dynamic(
  () => import("@/components/maps/ParcelMap").then((m) => m.ParcelMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-paper-map">
        <Loader2 className="h-6 w-6 animate-spin text-ink-fade" />
      </div>
    ),
  },
);

// ── Types ──────────────────────────────────────────────────────────────────

interface ApiParcel {
  id: string;
  parcelId?: string | null;
  address: string;
  lat: string | number | null;
  lng: string | number | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
  geom_x?: string | number | null;
  geom_y?: string | number | null;
  x?: string | number | null;
  y?: string | number | null;
  acreage?: string | number | null;
  floodZone?: string | null;
  currentZoning?: string | null;
  propertyDbId?: string | null;
  geometryLookupKey?: string | null;
  hasGeometry?: boolean;
  owner?: string | null;
  deal?: { id: string; name: string; sku: string; status: string } | null;
}

type PendingSelectionMetric = {
  parcelId: string;
  source: "search" | "map";
  startedAt: number;
  initialSelectedCount: number;
};

interface ParcelsApiResponse {
  parcels: ApiParcel[];
  source?: "org" | "property-db" | "org-fallback";
  error?: string;
}

interface ParcelSuggestApiResponse {
  suggestions: ParcelSearchSuggestion[];
}

// ── Constants ──────────────────────────────────────────────────────────────

const SURROUNDING_PARCELS_RADIUS_MILES = 1.25;
const SEARCH_PARAMS_EVENT = "map:search-params-change";
const MAP_PLOT_MAX_GEOMETRIES = 40;
const MAP_PLOT_GEOMETRY_BATCH_SIZE = 8;
const MAP_PLOT_BATCH_DELAY_MS = 75;
const MAP_PLOT_LAYER_COLOR = "#f97316";
const MAP_PLOT_SINGLE_PARCEL_ZOOM = 16;
const MAP_PLOT_MULTI_PARCEL_ZOOM = 11;
const AUTH_DISABLED_HINT =
  process.env.NODE_ENV !== "production"
    ? " Start the dev server with NEXT_PUBLIC_DISABLE_AUTH=true or sign in."
    : " Please sign in and try again.";

// ── URL search-params shim ─────────────────────────────────────────────────

let historySearchParamsPatched = false;
let originalPushState: typeof window.history.pushState | null = null;
let originalReplaceState: typeof window.history.replaceState | null = null;

function emitSearchParamsChange() {
  queueMicrotask(() => {
    window.dispatchEvent(new Event(SEARCH_PARAMS_EVENT));
  });
}

function restoreHistoryMethods() {
  if (!historySearchParamsPatched || typeof window === "undefined") return;
  if (originalPushState) window.history.pushState = originalPushState;
  if (originalReplaceState) window.history.replaceState = originalReplaceState;
  originalPushState = null;
  originalReplaceState = null;
  historySearchParamsPatched = false;
}

function ensureHistorySearchParamsPatched() {
  if (historySearchParamsPatched || typeof window === "undefined") return;
  historySearchParamsPatched = true;
  originalPushState = window.history.pushState;
  originalReplaceState = window.history.replaceState;
  window.history.pushState = function pushStatePatched(...args) {
    const result = originalPushState?.apply(this, args);
    emitSearchParamsChange();
    return result;
  };
  window.history.replaceState = function replaceStatePatched(...args) {
    const result = originalReplaceState?.apply(this, args);
    emitSearchParamsChange();
    return result;
  };
}

function subscribeToSearchParams(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => undefined;
  ensureHistorySearchParamsPatched();
  window.addEventListener("popstate", onStoreChange);
  window.addEventListener(SEARCH_PARAMS_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("popstate", onStoreChange);
    window.removeEventListener(SEARCH_PARAMS_EVENT, onStoreChange);
    restoreHistoryMethods();
  };
}

function getSearchParamsSnapshot() {
  if (typeof window === "undefined") return "";
  return window.location.search;
}

function useClientSearchParams() {
  const search = useSyncExternalStore(
    subscribeToSearchParams,
    getSearchParamsSnapshot,
    () => "",
  );
  return useMemo(() => new URLSearchParams(search.replace(/^\?/, "")), [search]);
}

// ── Utilities ──────────────────────────────────────────────────────────────

function distanceMiles(a: MapParcel, b: MapParcel): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 3958.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function toFiniteNumber(...values: Array<unknown>): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number(value.replace(/,/g, "").trim());
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getStringValue(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function uniqueParcelIds(parcelIds: string[]): string[] {
  const ids = new Set<string>();
  for (const id of parcelIds) {
    const normalized = normalizeParcelId(id) ?? id.trim();
    if (normalized.length > 0) ids.add(normalized);
  }
  return Array.from(ids);
}

function collectParcelIdsFromRows(rows: Array<Record<string, unknown>>): string[] {
  const ids: string[] = [];
  for (const row of rows) {
    const id =
      getStringValue(row.parcel_id) ??
      getStringValue(row.parcelId) ??
      getStringValue(row.p_parcel_id) ??
      getStringValue(row.id);
    if (id) ids.push(id);
  }
  return uniqueParcelIds(ids);
}

function collectParcelIdsFromMapActionPayload(payload: unknown): string[] {
  if (!isRecord(payload) || payload.action !== "highlight" || !Array.isArray(payload.parcelIds)) {
    return [];
  }
  return uniqueParcelIds(payload.parcelIds.map((id) => getStringValue(id)).filter((id): id is string => Boolean(id)));
}

type AddLayerPayload = Extract<MapActionPayload, { action: "addLayer" }>;
type PlotFeature = AddLayerPayload["geojson"]["features"][number];
type PlotGeometry = Extract<PlotFeature["geometry"], { type: "Polygon" | "MultiPolygon" }>;

function parsePlotGeometry(value: unknown): PlotGeometry | null {
  let candidate = value;
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate) as unknown;
    } catch {
      return null;
    }
  }
  if (!isRecord(candidate)) return null;
  if (
    (candidate.type === "Polygon" || candidate.type === "MultiPolygon") &&
    Array.isArray(candidate.coordinates)
  ) {
    return candidate as PlotGeometry;
  }
  return null;
}

function parsePlotBbox(value: unknown): [number, number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 4) return null;
  const west = toFiniteNumber(value[0]);
  const south = toFiniteNumber(value[1]);
  const east = toFiniteNumber(value[2]);
  const north = toFiniteNumber(value[3]);
  if (west == null || south == null || east == null || north == null) return null;
  return [west, south, east, north];
}

function collectCoordinatePairs(value: unknown, pairs: Array<[number, number]>) {
  if (!Array.isArray(value)) return;
  const lng = toFiniteNumber(value[0]);
  const lat = toFiniteNumber(value[1]);
  if (lng != null && lat != null) {
    pairs.push([lng, lat]);
    return;
  }
  for (const item of value) collectCoordinatePairs(item, pairs);
}

function bboxFromPlotGeometry(geometry: PlotGeometry): [number, number, number, number] | null {
  const pairs: Array<[number, number]> = [];
  collectCoordinatePairs(geometry.coordinates, pairs);
  if (pairs.length === 0) return null;
  let west = Number.POSITIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;
  for (const [lng, lat] of pairs) {
    west = Math.min(west, lng);
    south = Math.min(south, lat);
    east = Math.max(east, lng);
    north = Math.max(north, lat);
  }
  return [west, south, east, north];
}

function mergeBbox(
  current: [number, number, number, number] | null,
  next: [number, number, number, number],
): [number, number, number, number] {
  if (!current) return next;
  return [
    Math.min(current[0], next[0]),
    Math.min(current[1], next[1]),
    Math.max(current[2], next[2]),
    Math.max(current[3], next[3]),
  ];
}

function centerFromBbox(bbox: [number, number, number, number]): [number, number] {
  return [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function fetchPlotGeometry(parcelId: string): Promise<{ feature: PlotFeature; bbox: [number, number, number, number] } | null> {
  const response = await fetch(`/api/parcels/${encodeURIComponent(parcelId)}/geometry?detail_level=low`);
  const json: unknown = await response.json().catch(() => null);
  if (!response.ok || !isRecord(json) || json.ok !== true || !isRecord(json.data)) return null;
  const geometry = parsePlotGeometry(json.data.geom_simplified);
  if (!geometry) return null;
  const bbox = parsePlotBbox(json.data.bbox) ?? bboxFromPlotGeometry(geometry);
  if (!bbox) return null;
  return {
    bbox,
    feature: {
      type: "Feature",
      geometry,
      properties: {
        parcelId,
        parcel_id: parcelId,
      },
    },
  };
}

async function fetchPlotGeometries(parcelIds: string[]): Promise<{
  bbox: [number, number, number, number] | null;
  features: PlotFeature[];
}> {
  const features: PlotFeature[] = [];
  let bbox: [number, number, number, number] | null = null;
  const ids = parcelIds.slice(0, MAP_PLOT_MAX_GEOMETRIES);

  for (let index = 0; index < ids.length; index += MAP_PLOT_GEOMETRY_BATCH_SIZE) {
    const batch = ids.slice(index, index + MAP_PLOT_GEOMETRY_BATCH_SIZE);
    const results = await Promise.all(batch.map((id) => fetchPlotGeometry(id)));
    for (const result of results) {
      if (!result) continue;
      features.push(result.feature);
      bbox = mergeBbox(bbox, result.bbox);
    }
    if (index + MAP_PLOT_GEOMETRY_BATCH_SIZE < ids.length) {
      await delay(MAP_PLOT_BATCH_DELAY_MS);
    }
  }

  return { bbox, features };
}

function trackedParcelToMapParcel(entry: MapTrackedParcel): MapParcel {
  return {
    id: entry.parcelId,
    parcelId: entry.parcelId,
    address: entry.address,
    lat: entry.lat,
    lng: entry.lng,
    currentZoning: entry.currentZoning ?? null,
    acreage: entry.acreage ?? null,
    floodZone: entry.floodZone ?? null,
    propertyDbId: null,
    geometryLookupKey: entry.parcelId,
    hasGeometry: true,
  };
}

export type MapPageShortcutAction =
  | "toggle-sidebar"
  | "zoom-in"
  | "zoom-out"
  | "deselect-all"
  | null;

export function getMapPageShortcutAction(params: {
  key: string;
  tagName?: string | null;
  isContentEditable?: boolean | null;
}): MapPageShortcutAction {
  const tag = params.tagName?.toUpperCase() ?? "";
  if (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    params.isContentEditable
  ) {
    return null;
  }
  switch (params.key) {
    case "[":
      return "toggle-sidebar";
    case "+":
    case "=":
      return "zoom-in";
    case "-":
    case "_":
      return "zoom-out";
    case "Escape":
      return "deselect-all";
    default:
      return null;
  }
}

// ── FeedPanel result shape ─────────────────────────────────────────────────

type FeedResult = {
  id: string;
  kind: string;
  q: string;
  t: string;
  answer: string;
  stats?: Array<{ k: string; v: string }>;
  rows?: Array<{ owner: string; parcels: number; acres: number }>;
  narrative?: string;
  parcelIds?: string[];
};

// ── Component ──────────────────────────────────────────────────────────────

/**
 * Client controller for the Atlas map redesign.
 * Layout: TopChrome (56px) → StatusStrip (30px) → Body (260px | 1fr | 360px)
 * Forces light mode — the Atlas design uses warm paper, not dark.
 */
export function MapPageClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useClientSearchParams();
  const { setTheme } = useTheme();
  const isMobile = useIsMobile();
  const setSidebarCollapsed = useUIStore((state) => state.setSidebarCollapsed);
  const setCopilotOpen = useUIStore((state) => state.setCopilotOpen);
  const mapState = useMapChatState();
  const mapDispatch = useMapChatDispatch();
  const overlays = useOverlayState();
  const mapRef = useRef<ParcelMapRef | null>(null);
  const [isMapReady, setIsMapReady] = useState(false);
  const [mapRefVersion, setMapRefVersion] = useState(0);
  const initializedFromUrlRef = useRef(false);
  const [feedTab, setFeedTab] = useState<"results" | "screening" | "owner">(
    "results",
  );

  // ── Light mode for Atlas ────────────────────────────────────────────────
  useLayoutEffect(() => {
    const root = document.documentElement;
    const previous = {
      dark: root.classList.contains("dark"),
      light: root.classList.contains("light"),
      colorScheme: root.style.colorScheme,
    };

    setTheme("light");
    root.classList.remove("dark");
    root.classList.add("light");
    root.style.colorScheme = "light";

    return () => {
      root.classList.remove("dark");
      root.classList.remove("light");
      if (previous.dark) root.classList.add("dark");
      if (previous.light) root.classList.add("light");
      root.style.colorScheme = previous.colorScheme;
    };
  }, [setTheme]);

  // Auto-collapse sidebar
  useEffect(() => {
    setSidebarCollapsed(true);
    setCopilotOpen(false);
  }, [setCopilotOpen, setSidebarCollapsed]);

  // ── State ───────────────────────────────────────────────────────────────
  const [parcels, setParcels] = useState<MapParcel[]>([]);
  const [searchParcels, setSearchParcels] = useState<MapParcel[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [analysisText, setAnalysisText] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [searchSubmitId, setSearchSubmitId] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastDataRefreshAt, setLastDataRefreshAt] = useState<number | null>(null);
  const [lastRequestLatencyMs, setLastRequestLatencyMs] = useState<number | null>(null);
  const [mapHudState, setMapHudState] = useState<MapHudState>({
    activeOverlays: [],
    drawMode: "idle",
  });
  const [source, setSource] = useState<"org" | "property-db" | "org-fallback">("org");
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [isSuggestLoading, setIsSuggestLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<ParcelSearchSuggestion[]>([]);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const [searchLookupOverride, setSearchLookupOverride] = useState<string | null>(null);
  const [selectedSuggestion, setSelectedSuggestion] =
    useState<ParcelSearchSuggestion | null>(null);
  const [nlQueryLoading, setNlQueryLoading] = useState(false);
  const [feedResults, setFeedResults] = useState<FeedResult[]>([]);
  const [polygon, setPolygon] = useState<number[][][] | null>(null);
  const [polygonParcels, setPolygonParcels] = useState<MapParcel[] | null>(null);
  const [polygonError, setPolygonError] = useState<string | null>(null);
  const [isPolygonLoading, setIsPolygonLoading] = useState(false);
  const [cursorCoords, setCursorCoords] = useState<{ lat: number; lng: number } | null>(null);
  const lastAutoFocusedSearchRef = useRef("");
  const lastViewportRefreshKeyRef = useRef<string | null>(null);
  const addressInputRef = useRef<HTMLInputElement | null>(null);

  // ── URL params → initial viewport ───────────────────────────────────────
  const initialCenterFromUrl = useMemo<[number, number]>(() => {
    const latStr = searchParams.get("lat");
    const lngStr = searchParams.get("lng");
    if (latStr != null && lngStr != null) {
      const lat = Number(latStr);
      const lng = Number(lngStr);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return [lat, lng];
    }
    return [30.4515, -91.1871];
  }, [searchParams]);

  const initialZoomFromUrl = useMemo<number | undefined>(() => {
    const zStr = searchParams.get("z");
    if (zStr == null) return undefined;
    const zoom = Number(zStr);
    return Number.isFinite(zoom) ? zoom : undefined;
  }, [searchParams]);

  const selectedParcelIds = useMemo(
    () => new Set(mapState.selectedParcelIds),
    [mapState.selectedParcelIds],
  );
  const pendingSelectionMetricRef = useRef<PendingSelectionMetric | null>(null);
  const previousSelectedParcelIdsRef = useRef<string[]>(mapState.selectedParcelIds);

  // ── Keyboard shortcuts ───────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: Event) => {
      const event = e as unknown as KeyboardEvent;
      const target = event.target as HTMLElement | null;
      const action = getMapPageShortcutAction({
        key: event.key,
        tagName: target?.tagName ?? null,
        isContentEditable: target?.isContentEditable ?? null,
      });
      if (!action) return;
      event.preventDefault();
      if (action === "toggle-sidebar") return;
      if (action === "zoom-in") {
        (
          mapRef.current as (ParcelMapRef & {
            zoomIn?: () => void;
          }) | null
        )?.zoomIn?.();
        return;
      }
      if (action === "zoom-out") {
        (
          mapRef.current as (ParcelMapRef & {
            zoomOut?: () => void;
          }) | null
        )?.zoomOut?.();
        return;
      }
      if (action === "deselect-all") {
        mapDispatch({ type: "DESELECT_ALL" });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mapDispatch]);

  // ── Derived viewport values ─────────────────────────────────────────────
  const mapCenter = useMemo<[number, number]>(
    () =>
      mapState.center
        ? [mapState.center[1], mapState.center[0]]
        : initialCenterFromUrl,
    [initialCenterFromUrl, mapState.center],
  );
  const PARCEL_MIN_INIT_ZOOM = 11;
  const rawZoom = mapState.zoom ?? initialZoomFromUrl ?? PARCEL_MIN_INIT_ZOOM;
  const mapZoom = Math.max(rawZoom, PARCEL_MIN_INIT_ZOOM);

  // ── Focus helpers ────────────────────────────────────────────────────────
  const focusCoordinates = useCallback(
    (lat: number, lng: number) => {
      const nextZoom = typeof mapZoom === "number" ? Math.max(mapZoom, 16) : 16;
      mapDispatch({ type: "SET_VIEWPORT", center: [lng, lat], zoom: nextZoom });
      mapRef.current?.flyTo({ center: [lng, lat], zoom: nextZoom });
    },
    [mapDispatch, mapZoom],
  );

  const focusParcel = useCallback(
    (parcel: MapParcel) => {
      mapDispatch({ type: "SELECT_PARCELS", parcelIds: [parcel.id] });
      mapRef.current?.highlightParcels([parcel.id], "outline", undefined, 0);
      focusCoordinates(parcel.lat, parcel.lng);
    },
    [focusCoordinates, mapDispatch],
  );

  const markRequestComplete = useCallback((startedAt: number) => {
    setLastRequestLatencyMs(Math.max(1, Date.now() - startedAt));
    setLastDataRefreshAt(Date.now());
  }, []);

  // ── Init from URL ────────────────────────────────────────────────────────
  useEffect(() => {
    if (initializedFromUrlRef.current) return;
    initializedFromUrlRef.current = true;

    if (!mapState.center) {
      mapDispatch({
        type: "SET_VIEWPORT",
        center: [initialCenterFromUrl[1], initialCenterFromUrl[0]],
        zoom: Math.max(initialZoomFromUrl ?? 11, PARCEL_MIN_INIT_ZOOM),
      });
    } else if (mapState.zoom != null && mapState.zoom < PARCEL_MIN_INIT_ZOOM) {
      mapDispatch({
        type: "SET_VIEWPORT",
        center: mapState.center,
        zoom: PARCEL_MIN_INIT_ZOOM,
      });
    }

    if (mapState.selectedParcelIds.length === 0) {
      const selectedParcelId = searchParams.get("parcel");
      if (selectedParcelId) {
        mapDispatch({ type: "SELECT_PARCELS", parcelIds: [selectedParcelId] });
      }
    }
  }, [
    initialCenterFromUrl,
    initialZoomFromUrl,
    mapDispatch,
    mapState.center,
    mapState.zoom,
    mapState.selectedParcelIds.length,
    searchParams,
  ]);

  // ── NL query → feed results ─────────────────────────────────────────────
  const lastNlConversationIdRef = useRef<string | null>(null);

  const handleNlQuery = useCallback(
    async (query: string) => {
      setNlQueryLoading(true);
      try {
        const mapContextInput = buildMapContextInput(mapState);
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: query, mapContext: mapContextInput }),
        });
        if (!res.ok || !res.body) {
          setNlQueryLoading(false);
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullText = "";
        let buffer = "";
        const toolRows: Array<Record<string, unknown>> = [];
        const toolParcelIds: string[] = [];
        let rowCount: number | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr || jsonStr === "[DONE]") continue;
            try {
              const event = JSON.parse(jsonStr);
              if (event.type === "map_action" && event.payload) {
                toolParcelIds.push(...collectParcelIdsFromMapActionPayload(event.payload));
                mapDispatch({ type: "MAP_ACTION_RECEIVED", payload: event.payload });
              }
              const textDelta = extractNlQueryTextDelta(event);
              if (textDelta) fullText += textDelta;
              const finalText = extractNlQueryFinalText(event);
              if (finalText) fullText = finalText;
              const parsedRows = extractNlQueryRows(event);
              if (parsedRows) {
                toolRows.push(...parsedRows.rows);
                toolParcelIds.push(...collectParcelIdsFromRows(parsedRows.rows));
                if (typeof parsedRows.rowCount === "number")
                  rowCount = parsedRows.rowCount;
              }
              if (event.type === "done" && event.conversationId) {
                lastNlConversationIdRef.current = event.conversationId as string;
              }
            } catch {
              // skip malformed
            }
          }
        }

        if (fullText.trim() || toolRows.length > 0) {
          const cardId = `nl-${Date.now()}`;
          const subtitle =
            rowCount != null
              ? `${rowCount} result${rowCount !== 1 ? "s" : ""}`
              : toolRows.length > 0
              ? `${toolRows.length} result${toolRows.length !== 1 ? "s" : ""}`
              : "AI Analysis";

          // Build owner rows if available
          const ownerRows: FeedResult["rows"] =
            toolRows.length > 0 &&
            toolRows[0] &&
            "owner" in toolRows[0]
              ? toolRows.map((r) => ({
                  owner: String(r["owner"] ?? ""),
                  parcels: Number(
                    r["parcels"] ?? r["count"] ?? (getStringValue(r["parcel_id"]) ? 1 : 0),
                  ),
                  acres: Number(r["acres"] ?? r["acreage"] ?? 0),
                }))
              : undefined;

          // Build stats
          const stats: FeedResult["stats"] =
            toolRows.length <= 3 &&
            toolRows.length > 0 &&
            Object.keys(toolRows[0] ?? {}).some((k) =>
              /cnt|count|total|avg|sum/i.test(k),
            )
              ? Object.entries(toolRows[0] ?? {}).map(([k, v]) => ({
                  k: k.replace(/_/g, " "),
                  v: String(v),
                }))
              : undefined;

          const result: FeedResult = {
            id: cardId,
            kind: toolRows.length > 0 ? "table" : "narrative",
            q: query,
            t: subtitle,
            answer: fullText.trim().slice(0, 1000),
            stats,
            rows: ownerRows,
            narrative: fullText.trim().slice(0, 1000) || undefined,
            parcelIds: uniqueParcelIds(toolParcelIds),
          };

          setFeedResults((prev) => [...prev, result]);
          setFeedTab("results");
        }
      } catch (err) {
        console.error("[atlas] NL query failed:", err);
      } finally {
        setNlQueryLoading(false);
      }
    },
    [mapState, mapDispatch],
  );

  // ── Search handlers ──────────────────────────────────────────────────────
  const handleSearchSubmit = (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const nextSearch = searchText.trim();
    if (!nextSearch) return;
    setSearchLookupOverride(null);
    setSelectedSuggestion(null);
    setDebouncedSearch(nextSearch);
    setSearchSubmitId((v) => v + 1);
    setSuggestions([]);
    setActiveSuggestionIndex(-1);
  };

  const handleAnalysisSubmit = useCallback(
    (event?: FormEvent<HTMLFormElement>) => {
      event?.preventDefault();
      const nextPrompt = analysisText.trim();
      if (!nextPrompt) return;
      if (isLikelyParcelLookupQuery(nextPrompt) && !isLikelyMapAnalysisQuery(nextPrompt)) {
        setSearchText(nextPrompt);
        setAnalysisText("");
        setSearchLookupOverride(null);
        setSelectedSuggestion(null);
        setDebouncedSearch(nextPrompt);
        setSearchSubmitId((v) => v + 1);
        setSuggestions([]);
        setActiveSuggestionIndex(-1);
        addressInputRef.current?.focus();
        return;
      }
      setAnalysisText("");
      void handleNlQuery(nextPrompt);
    },
    [analysisText, handleNlQuery],
  );

  const selectSuggestion = useCallback(
    (suggestion: ParcelSearchSuggestion) => {
      const nextSearch = suggestion.address.trim();
      if (!nextSearch) return;
      const nextLookupText = buildSuggestionLookupText(suggestion);
      const canonicalSuggestionParcelId =
        normalizeParcelId(
          suggestion.parcelId ??
            suggestion.propertyDbId ??
            suggestion.id ??
            nextLookupText,
        ) ?? nextLookupText;
      const resolvedParcel =
        resolveSuggestionParcel(suggestion, searchParcels ?? []) ??
        resolveSuggestionParcel(suggestion, parcels);

      setSearchText(nextSearch);
      setSearchLookupOverride(nextLookupText);
      setDebouncedSearch(nextLookupText);
      setSearchSubmitId((v) => v + 1);
      setSuggestions([]);
      setActiveSuggestionIndex(-1);
      setSelectedSuggestion(resolvedParcel ? null : suggestion);
      pendingSelectionMetricRef.current = {
        parcelId: canonicalSuggestionParcelId,
        source: "search",
        startedAt:
          typeof performance !== "undefined" ? performance.now() : Date.now(),
        initialSelectedCount: selectedParcelIds.size,
      };
      if (resolvedParcel) {
        focusParcel(resolvedParcel);
        return;
      }
      if (
        typeof suggestion.lat === "number" &&
        Number.isFinite(suggestion.lat) &&
        typeof suggestion.lng === "number" &&
        Number.isFinite(suggestion.lng)
      ) {
        focusCoordinates(suggestion.lat, suggestion.lng);
      }
    },
    [focusCoordinates, focusParcel, parcels, searchParcels, selectedParcelIds.size],
  );

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" && suggestions.length > 0) {
      event.preventDefault();
      setActiveSuggestionIndex((prev) => (prev + 1) % suggestions.length);
      return;
    }
    if (event.key === "ArrowUp" && suggestions.length > 0) {
      event.preventDefault();
      setActiveSuggestionIndex((prev) =>
        prev <= 0 ? suggestions.length - 1 : prev - 1,
      );
      return;
    }
    if (event.key === "Escape") {
      setSuggestions([]);
      setActiveSuggestionIndex(-1);
      return;
    }
    if (event.key !== "Enter") return;
    if (!searchText.trim()) return;
    event.preventDefault();
    if (activeSuggestionIndex >= 0 && activeSuggestionIndex < suggestions.length) {
      selectSuggestion(suggestions[activeSuggestionIndex]);
      return;
    }
    handleSearchSubmit();
  };

  // ── Debounce search ──────────────────────────────────────────────────────
  useEffect(() => {
    const nextSearch = searchText.trim();
    if (!nextSearch) {
      setDebouncedSearch("");
      setSearchLookupOverride(null);
      setSelectedSuggestion(null);
      return;
    }
    const timeout = setTimeout(() => {
      setDebouncedSearch(searchLookupOverride?.trim() || nextSearch);
    }, 250);
    return () => clearTimeout(timeout);
  }, [searchLookupOverride, searchText]);

  // ── Suggest API ──────────────────────────────────────────────────────────
  useEffect(() => {
    const query = searchText.trim();
    if (query.length < 2) {
      setSuggestions([]);
      setActiveSuggestionIndex(-1);
      setIsSuggestLoading(false);
      return;
    }
    let active = true;
    const timeout = setTimeout(async () => {
      setIsSuggestLoading(true);
      try {
        const qs = new URLSearchParams({ q: query, limit: "8" });
        const res = await fetch(`/api/parcels/suggest?${qs.toString()}`);
        if (!res.ok || !active) {
          if (active) {
            setSuggestions([]);
            setActiveSuggestionIndex(-1);
          }
          return;
        }
        const data = (await res.json()) as ParcelSuggestApiResponse;
        if (!active) return;
        const next = Array.isArray(data.suggestions) ? data.suggestions : [];
        const localFallback =
          next.length === 0
            ? parcels
                .filter((p) => parcelMatchesSearch(p, query))
                .slice(0, 8)
                .map((p) => ({
                  id: p.id,
                  parcelId: p.parcelId,
                  address: p.address,
                  lat: p.lat,
                  lng: p.lng,
                  propertyDbId: p.propertyDbId ?? null,
                  hasGeometry: p.hasGeometry ?? true,
                  owner: p.owner ?? null,
                }))
            : [];
        const effective = next.length > 0 ? next : localFallback;
        setSuggestions(effective);
        setActiveSuggestionIndex(effective.length > 0 ? 0 : -1);
      } catch {
        if (active) {
          setSuggestions([]);
          setActiveSuggestionIndex(-1);
        }
      } finally {
        if (active) setIsSuggestLoading(false);
      }
    }, 160);
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [parcels, searchText]);

  // ── Parcel mapping helpers ───────────────────────────────────────────────
  const mapApiParcels = (data: ParcelsApiResponse): MapParcel[] =>
    (data.parcels as ApiParcel[]).reduce<MapParcel[]>((acc, p) => {
      const lat = toFiniteNumber(p.lat, p.latitude, p.geom_y, p.y);
      const lng = toFiniteNumber(p.lng, p.longitude, p.geom_x, p.x);
      if (lat == null || lng == null) return acc;
      const parcelId = normalizeParcelId(p.parcelId ?? p.propertyDbId ?? p.id);
      if (!parcelId || p.hasGeometry === false) return acc;

      const rawPropertyDbId =
        (typeof p.propertyDbId === "string" && p.propertyDbId.trim().length > 0
          ? p.propertyDbId.trim()
          : null) ??
        (typeof p.geometryLookupKey === "string" &&
        p.geometryLookupKey.trim().length > 0
          ? p.geometryLookupKey.trim()
          : null);

      acc.push({
        id: parcelId,
        parcelId,
        address: p.address,
        lat,
        lng,
        dealId: p.deal?.id,
        dealName: p.deal?.name,
        dealStatus: p.deal?.status,
        floodZone: p.floodZone ?? null,
        currentZoning: p.currentZoning ?? null,
        propertyDbId: rawPropertyDbId ?? parcelId,
        geometryLookupKey: rawPropertyDbId ?? parcelId,
        hasGeometry: true,
        acreage: p.acreage != null ? Number(p.acreage) : null,
        owner: p.owner ?? null,
      });
      return acc;
    }, []);

  const mapParcelToFeature = useCallback(
    (parcel: MapParcel): MapFeature => ({
      parcelId: parcel.id,
      address: parcel.address,
      zoningType: parcel.currentZoning ?? undefined,
      acres: parcel.acreage ?? undefined,
      center: { lat: parcel.lat, lng: parcel.lng },
      label: parcel.address,
    }),
    [],
  );

  // ── Polygon search ───────────────────────────────────────────────────────
  const loadPolygonParcels = useCallback(
    async (coords: number[][][]) => {
      setIsPolygonLoading(true);
      setPolygonError(null);
      const startedAt = Date.now();
      try {
        const result = await requestProspectParcels({
          polygon: coords,
          searchText: debouncedSearch,
        });
        if (result.error) {
          setPolygonParcels([]);
          setPolygonError(result.error);
          return;
        }
        setPolygonParcels(result.parcels);
        markRequestComplete(startedAt);
      } catch {
        setPolygonParcels([]);
        setPolygonError("Polygon search failed. Please try again.");
      } finally {
        setIsPolygonLoading(false);
      }
    },
    [debouncedSearch, markRequestComplete],
  );

  // ── Visible parcels ──────────────────────────────────────────────────────
  const visibleParcels = useMemo(() => {
    const query = debouncedSearch.toLowerCase();
    if (!query) return parcels;
    if (!searchParcels || searchParcels.length === 0) return [];
    const surrounding = parcels.filter((parcel) =>
      searchParcels.some(
        (anchor) => distanceMiles(anchor, parcel) <= SURROUNDING_PARCELS_RADIUS_MILES,
      ),
    );
    const merged = new Map<string, MapParcel>();
    for (const parcel of surrounding) merged.set(parcel.id, parcel);
    for (const parcel of searchParcels) merged.set(parcel.id, parcel);
    return Array.from(merged.values());
  }, [debouncedSearch, parcels, searchParcels]);

  const isSearchActive = debouncedSearch.trim().length > 0;
  const hasNoSearchResults =
    isSearchActive && searchParcels !== null && searchParcels.length === 0;
  const searchMatchCount = searchParcels?.length ?? 0;
  const workingSetCount = selectedParcelIds.size;

  const nearbyParcelCount = useMemo(() => {
    if (!isSearchActive || !searchParcels || searchParcels.length === 0) return 0;
    const matchIds = new Set(searchParcels.map((p) => p.id));
    return visibleParcels.reduce(
      (count, p) => (matchIds.has(p.id) ? count : count + 1),
      0,
    );
  }, [isSearchActive, searchParcels, visibleParcels]);

  const activeParcels = useMemo(() => {
    if (polygon) return polygonParcels ?? [];
    return visibleParcels;
  }, [polygon, polygonParcels, visibleParcels]);

  const activeParcelsByKey = useMemo(() => {
    const index = new Map<string, MapParcel>();
    for (const parcel of activeParcels) {
      for (const key of [parcel.id, parcel.parcelId]) {
        const normalizedKey = key.trim();
        if (!normalizedKey) continue;
        index.set(normalizedKey, parcel);
      }
    }
    return index;
  }, [activeParcels]);

  const workspaceAiOutputs = useMemo(
    () =>
      feedResults.map((r) => ({
        id: r.id,
        title: r.q,
        createdAt: new Date().toISOString(),
        summary: r.narrative ?? r.t,
        payload: { kind: r.kind },
      })),
    [feedResults],
  );

  // ── Workspace ────────────────────────────────────────────────────────────
  const {
    trackedParcels,
    workspaceSyncState,
    reloadWorkspace: _reloadWorkspace,
    saveTrackedSelection,
    removeTrackedSelection,
    updateTrackedSelectionStatus,
  } = useMapTrackedParcelWorkspace({
    activeParcels,
    selectedParcelIds: mapState.selectedParcelIds,
    polygon,
    aiOutputs: workspaceAiOutputs,
    activeOverlayKeys: mapHudState.activeOverlays,
  });

  const trackedParcelsById = useMemo(
    () => new Map(trackedParcels.map((entry) => [entry.parcelId, entry])),
    [trackedParcels],
  );
  const trackedParcelIds = useMemo(
    () => new Set(trackedParcels.map((entry) => entry.parcelId)),
    [trackedParcels],
  );
  const trackedSummary = useMemo(
    () => summarizeTrackedParcels(trackedParcels),
    [trackedParcels],
  );

  const selectedParcels = useMemo(
    () =>
      mapState.selectedParcelIds
        .map((parcelId) => {
          const activeParcel = activeParcelsByKey.get(parcelId);
          if (activeParcel) return activeParcel;
          const trackedParcel = trackedParcelsById.get(parcelId);
          return trackedParcel ? trackedParcelToMapParcel(trackedParcel) : null;
        })
        .filter((p): p is MapParcel => Boolean(p)),
    [activeParcelsByKey, mapState.selectedParcelIds, trackedParcelsById],
  );

  const mapWorkbench = useMapInvestorWorkbench({
    activeParcels,
    selectedParcels,
    trackedParcels,
    hudState: mapHudState,
    polygon,
    resultCount: feedResults.length,
  });

  // ── Selected parcel for feed panel ──────────────────────────────────────
  const selectedParcel = useMemo(() => {
    if (selectedParcels.length === 0) return null;
    const p = selectedParcels[0];
    return {
      id: p.id,
      code: p.parcelId,
      name: p.address,
      addr: p.address,
      owner: p.owner ?? undefined,
      acres: p.acreage ?? undefined,
      zoning: p.currentZoning ?? undefined,
    };
  }, [selectedParcels]);

  const focusTrackedParcel = useCallback(
    (entry: MapTrackedParcel) => {
      const parcel = activeParcelsByKey.get(entry.parcelId);
      if (parcel) {
        focusParcel(parcel);
        return;
      }
      mapDispatch({ type: "SELECT_PARCELS", parcelIds: [entry.parcelId] });
      mapRef.current?.highlightParcels([entry.parcelId], "outline", undefined, 0);
      focusCoordinates(entry.lat, entry.lng);
    },
    [activeParcelsByKey, focusCoordinates, focusParcel, mapDispatch],
  );

  const handlePlotFeedResult = useCallback(
    async (resultId: string) => {
      const result = feedResults.find((item) => item.id === resultId);
      const parcelIds = uniqueParcelIds(result?.parcelIds ?? []);
      if (parcelIds.length === 0) return;

      mapDispatch({
        type: "MAP_ACTION_RECEIVED",
        payload: {
          action: "highlight",
          parcelIds,
          style: "fill",
          color: MAP_PLOT_LAYER_COLOR,
          durationMs: 0,
        },
      });

      const firstActiveParcel = parcelIds
        .map((parcelId) => activeParcelsByKey.get(parcelId))
        .find((parcel): parcel is MapParcel => Boolean(parcel));
      if (firstActiveParcel) {
        focusCoordinates(firstActiveParcel.lat, firstActiveParcel.lng);
      }

      const layerId = `nl-result-${resultId}`;
      const { bbox, features } = await fetchPlotGeometries(parcelIds);
      if (features.length > 0) {
        mapDispatch({
          type: "MAP_ACTION_RECEIVED",
          payload: { action: "clearLayers", layerIds: [layerId] },
        });
        mapDispatch({
          type: "MAP_ACTION_RECEIVED",
          payload: {
            action: "addLayer",
            layerId,
            geojson: { type: "FeatureCollection", features },
            style: {
              fillColor: MAP_PLOT_LAYER_COLOR,
              fillOpacity: 0.28,
              strokeColor: MAP_PLOT_LAYER_COLOR,
              strokeWidth: 2,
            },
            label: `${result?.q ?? "Query"} (${features.length})`,
          },
        });
      }
      if (bbox) {
        const center = centerFromBbox(bbox);
        const zoom = parcelIds.length === 1 ? MAP_PLOT_SINGLE_PARCEL_ZOOM : MAP_PLOT_MULTI_PARCEL_ZOOM;
        mapDispatch({ type: "SET_VIEWPORT", center, zoom });
        mapRef.current?.flyTo({ center, zoom });
      }
      recordClientMetricEvent({
        message: "map.nl_result.plot_requested",
        metadata: {
          resultId,
          parcelCount: parcelIds.length,
          geometryCount: features.length,
        },
      });
    },
    [activeParcelsByKey, feedResults, focusCoordinates, mapDispatch],
  );

  // ── Sync selected features to context ───────────────────────────────────
  useEffect(() => {
    const selectedFeatures = selectedParcels.map(mapParcelToFeature);
    mapDispatch({ type: "SET_SELECTED_PARCEL_FEATURES", features: selectedFeatures });
  }, [mapDispatch, mapParcelToFeature, selectedParcels]);

  useEffect(() => {
    if (!selectedSuggestion) return;
    const resolvedParcel =
      resolveSuggestionParcel(selectedSuggestion, activeParcels) ??
      resolveSuggestionParcel(selectedSuggestion, searchParcels ?? []) ??
      resolveSuggestionParcel(selectedSuggestion, parcels);
    if (!resolvedParcel) return;
    pendingSelectionMetricRef.current = {
      parcelId: resolvedParcel.id,
      source: "search",
      startedAt:
        typeof performance !== "undefined" ? performance.now() : Date.now(),
      initialSelectedCount: selectedParcelIds.size,
    };
    focusParcel(resolvedParcel);
    setSelectedSuggestion(null);
  }, [
    activeParcels,
    focusParcel,
    parcels,
    searchParcels,
    selectedParcelIds.size,
    selectedSuggestion,
  ]);

  useEffect(() => {
    if (polygon) lastViewportRefreshKeyRef.current = null;
  }, [polygon]);

  // ── Base parcel load ─────────────────────────────────────────────────────
  useEffect(() => {
    async function loadBaseParcels() {
      const startedAt = Date.now();
      try {
        const res = await fetch("/api/parcels?hasCoords=true");
        if (!res.ok) {
          setLoadError(
            res.status === 401
              ? `Unauthorized.${AUTH_DISABLED_HINT}`
              : "Failed to load parcels. Please refresh and try again.",
          );
          return;
        }
        const data = (await res.json()) as ParcelsApiResponse;
        setSource(
          data.source === "property-db" || data.source === "org-fallback"
            ? data.source
            : "org",
        );
        if (data.error) setLoadError(data.error);
        const mapped = mapApiParcels(data);
        if (mapped.length === 0 && data.parcels.length > 0) {
          setLoadError(
            "Parcels were returned but missing usable coordinates (lat/lng). Check API parcel field names.",
          );
        }
        if (lastViewportRefreshKeyRef.current === null) {
          setParcels(mapped);
          markRequestComplete(startedAt);
        }
      } catch {
        setLoadError("Failed to load parcels. Please refresh and try again.");
      } finally {
        setLoading(false);
      }
    }
    void loadBaseParcels();

  }, [markRequestComplete]);

  // ── Viewport parcel refresh ──────────────────────────────────────────────
  useEffect(() => {
    const bounds = mapState.viewportBounds;
    if (polygon || !bounds) return;
    const { west, south, east, north } = bounds;
    const boundsForRefresh = { west, south, east, north };
    const viewportKey = [west, south, east, north].map((v) => v.toFixed(5)).join(":");
    if (lastViewportRefreshKeyRef.current === viewportKey) return;
    lastViewportRefreshKeyRef.current = viewportKey;
    let active = true;

    async function refreshViewportParcels() {
      const startedAt = Date.now();
      try {
        const result = await requestViewportParcels({ bounds: boundsForRefresh });
        if (!active) return;
        if (result.error) {
          if (result.unauthorized) setLoadError(`Unauthorized.${AUTH_DISABLED_HINT}`);
          return;
        }
        setLoadError(null);
        setParcels(result.parcels);
        markRequestComplete(startedAt);
      } catch {
        if (active && parcels.length === 0)
          setLoadError("Failed to refresh viewport parcels. Please try again.");
      }
    }
    void refreshViewportParcels();
    return () => {
      active = false;
    };
  }, [AUTH_DISABLED_HINT, mapState.viewportBounds, markRequestComplete, parcels.length, polygon]);

  // ── URL sync ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const next = new URLSearchParams(searchParams.toString());
    if (mapState.center) {
      next.set("lat", mapState.center[1].toFixed(6));
      next.set("lng", mapState.center[0].toFixed(6));
    }
    if (typeof mapState.zoom === "number") next.set("z", mapState.zoom.toFixed(2));
    if (mapState.selectedParcelIds.length === 1) {
      next.set("parcel", mapState.selectedParcelIds[0]);
    } else {
      next.delete("parcel");
    }
    router.replace(`/map?${next.toString()}`);
  }, [mapState.center, mapState.selectedParcelIds, mapState.zoom, router, searchParams]);

  // ── Search parcel load ───────────────────────────────────────────────────
  useEffect(() => {
    let active = true;
    async function loadSearchParcels() {
      if (polygon) {
        setSearchParcels(null);
        setIsSearchLoading(false);
        return;
      }
      const startedAt = Date.now();
      setIsSearchLoading(Boolean(debouncedSearch));
      if (!debouncedSearch) {
        setSearchParcels(null);
        setIsSearchLoading(false);
        return;
      }
      setLoadError(null);
      try {
        const qs = new URLSearchParams({ hasCoords: "true", search: debouncedSearch });
        const res = await fetch(`/api/parcels?${qs.toString()}`);
        if (!res.ok || !active) {
          if (active) {
            setSearchParcels([]);
            if (res.status === 401) setLoadError(`Unauthorized.${AUTH_DISABLED_HINT}`);
          }
          return;
        }
        const data = (await res.json()) as ParcelsApiResponse;
        if (!active) return;
        if (data.error) setLoadError(data.error);
        else setLoadError(null);
        setSource(
          data.source === "property-db" || data.source === "org-fallback"
            ? data.source
            : "org",
        );
        const mapped = mapApiParcels(data);
        const localMatches =
          mapped.length === 0
            ? parcels.filter((p) => parcelMatchesSearch(p, debouncedSearch))
            : [];
        const effectiveResults =
          mapped.length === 0 && localMatches.length > 0 ? localMatches : mapped;
        if (mapped.length === 0 && data.parcels.length > 0) {
          setLoadError("Search returned parcels without usable coordinates (lat/lng).");
        }
        if (mapped.length === 0 && localMatches.length > 0) setLoadError(null);
        setSearchParcels(effectiveResults);
        markRequestComplete(startedAt);
      } catch {
        if (active) {
          setSearchParcels([]);
          setLoadError("Search failed. Please try again.");
        }
      } finally {
        if (active) setIsSearchLoading(false);
      }
    }
    void loadSearchParcels();
    return () => {
      active = false;
    };

  }, [debouncedSearch, markRequestComplete, parcels, searchSubmitId, polygon]);

  // ── Auto-focus single search result ─────────────────────────────────────
  useEffect(() => {
    if (selectedSuggestion || !isSearchActive || searchParcels?.length !== 1) return;
    const focusKey = `${searchSubmitId}:${debouncedSearch}`;
    if (!focusKey || lastAutoFocusedSearchRef.current === focusKey) return;
    lastAutoFocusedSearchRef.current = focusKey;
    pendingSelectionMetricRef.current = {
      parcelId: searchParcels[0].id,
      source: "search",
      startedAt: typeof performance !== "undefined" ? performance.now() : Date.now(),
      initialSelectedCount: selectedParcelIds.size,
    };
    focusParcel(searchParcels[0]);
  }, [
    debouncedSearch,
    focusParcel,
    isSearchActive,
    searchParcels,
    searchSubmitId,
    selectedParcelIds.size,
    selectedSuggestion,
  ]);

  // ── Polygon load ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!polygon) {
      setPolygonParcels(null);
      setPolygonError(null);
      setIsPolygonLoading(false);
      return;
    }
    void loadPolygonParcels(polygon);
  }, [polygon, debouncedSearch, searchSubmitId, loadPolygonParcels]);

  // ── Selection metrics ────────────────────────────────────────────────────
  useEffect(() => {
    const previousSelected = previousSelectedParcelIdsRef.current;
    const nextSelected = mapState.selectedParcelIds;
    const addedParcelIds = nextSelected.filter(
      (id) => !previousSelected.includes(id),
    );
    const pendingMetric = pendingSelectionMetricRef.current;
    if (
      pendingMetric &&
      selectedParcelIds.has(pendingMetric.parcelId) &&
      nextSelected.length > pendingMetric.initialSelectedCount
    ) {
      const completedAt =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      recordClientMetricEvent({
        message: "map.parcel.selection.succeeded",
        durationMs: Math.max(0, Math.round(completedAt - pendingMetric.startedAt)),
        metadata: {
          parcelId: pendingMetric.parcelId,
          source: pendingMetric.source,
          workingSetCount: nextSelected.length,
          addedParcelIds,
        },
      });
      pendingSelectionMetricRef.current = null;
    } else if (addedParcelIds.length > 0) {
      recordClientMetricEvent({
        message: "map.parcel.selection.changed",
        metadata: { source: "map", addedParcelIds, workingSetCount: nextSelected.length },
      });
    }
    previousSelectedParcelIdsRef.current = nextSelected;
  }, [mapState.selectedParcelIds, selectedParcelIds]);

  // ── Pending map actions ──────────────────────────────────────────────────
  useEffect(() => {
    const nextAction = mapState.pendingActions[0];
    if (!nextAction || !mapRef.current || !isMapReady) return;
    if (nextAction.action === "highlight") {
      mapRef.current.highlightParcels(
        nextAction.parcelIds,
        nextAction.style,
        nextAction.color,
        nextAction.durationMs,
      );
      if (nextAction.durationMs === 0) {
        mapDispatch({ type: "SELECT_PARCELS", parcelIds: nextAction.parcelIds });
      }
    }
    if (nextAction.action === "flyTo") {
      mapRef.current.flyTo({ center: nextAction.center, zoom: nextAction.zoom ?? 15 });
      if (nextAction.parcelId) {
        mapDispatch({ type: "SELECT_PARCELS", parcelIds: [nextAction.parcelId] });
      }
    }
    if (nextAction.action === "addLayer") {
      mapRef.current.addTemporaryLayer(
        nextAction.layerId,
        nextAction.geojson,
        nextAction.style,
      );
      const features = mapFeaturesFromGeoJson(nextAction.geojson);
      if (features.length > 0) {
        mapDispatch({ type: "ADD_REFERENCED_FEATURES", features });
      }
    }
    if (nextAction.action === "clearLayers") {
      mapRef.current.clearTemporaryLayers(nextAction.layerIds);
    }
    mapDispatch({ type: "CONSUME_PENDING_ACTION" });
  }, [isMapReady, mapDispatch, mapRefVersion, mapState.pendingActions]);

  // ── Status text ──────────────────────────────────────────────────────────
  const statusText = useMemo(() => {
    if (loading) return "Loading...";
    if (polygon) {
      if (isPolygonLoading) return "Searching within polygon...";
      if (polygonError) return polygonError;
      const count = activeParcels.length;
      const suffix = debouncedSearch.trim() ? " (filtered)" : "";
      return `${count} parcels in polygon${suffix}`;
    }
    if (loadError) return loadError;
    if (hasNoSearchResults)
      return "No Baton Rouge parcels with verified geometry matched that lookup.";
    if (parcels.length === 0)
      return "Verified parcel geometry is temporarily unavailable.";
    if (source === "org-fallback")
      return `${visibleParcels.length} of ${parcels.length} parcels (property database fallback)`;
    return `${visibleParcels.length} of ${parcels.length} parcels`;
  }, [
    activeParcels.length,
    debouncedSearch,
    hasNoSearchResults,
    isPolygonLoading,
    loadError,
    loading,
    parcels.length,
    polygon,
    polygonError,
    source,
    visibleParcels.length,
  ]);

  // ── Spatial selection sync ───────────────────────────────────────────────
  useEffect(() => {
    mapDispatch({
      type: "SET_SPATIAL_SELECTION",
      selection: polygon
        ? {
            kind: "polygon",
            coordinates: polygon,
            parcelIds: polygonParcels?.map((p) => p.id),
            label: statusText,
          }
        : null,
    });
  }, [mapDispatch, polygon, polygonParcels, statusText]);

  useEffect(() => {
    if (mapState.viewportLabel === statusText) return;
    mapDispatch({ type: "SET_VIEWPORT_LABEL", label: statusText });
  }, [mapDispatch, mapState.viewportLabel, statusText]);

  const dataFreshnessLabel = useMemo(() => {
    if (!lastDataRefreshAt) return "No sync yet";
    const diff = Math.floor((Date.now() - lastDataRefreshAt) / 1000);
    if (diff < 5) return "Live";
    if (diff < 60) return `${diff}s ago`;
    return `${Math.floor(diff / 60)}m ago`;

  }, [lastDataRefreshAt, parcels.length, searchParcels?.length]);

  const latencyLabel = useMemo(
    () => (lastRequestLatencyMs == null ? "n/a" : `${lastRequestLatencyMs}ms`),
    [lastRequestLatencyMs],
  );

  const sourceLabel = useMemo(() => {
    if (source === "org-fallback") return "Org fallback";
    if (source === "property-db") return "Property DB";
    return "Org parcels";
  }, [source]);

  // ── Map ref attach ───────────────────────────────────────────────────────
  const attachMapRef = useCallback((instance: ParcelMapRef | null) => {
    mapRef.current = instance;
    if (!instance) setIsMapReady(false);
    setMapRefVersion((v) => v + 1);
  }, []);

  const clearPolygon = () => {
    setPolygon(null);
    setPolygonParcels(null);
    setPolygonError(null);
    setIsPolygonLoading(false);
  };

  // ── Polygon card derived data ─────────────────────────────────────────────
  const polygonCardData = useMemo(() => {
    if (!polygon || !polygonParcels) return null;
    const ownerSet = new Set(
      polygonParcels.map((p) => p.owner ?? "").filter(Boolean),
    );
    const totalAcres = polygonParcels.reduce(
      (sum, p) => sum + (p.acreage ?? 0),
      0,
    );
    return {
      parcelCount: polygonParcels.length,
      totalAcres,
      ownerCount: ownerSet.size,
    };
  }, [polygon, polygonParcels]);

  // ── Suggestion chip prompts ───────────────────────────────────────────────
  const suggestionChips = useMemo(
    () => [
      "Industrial parcels > 10ac",
      "Parcels near I-10 interchanges",
      "Owner concentration map",
    ],
    [],
  );

  // ── Reference retained state to satisfy exhaustive-deps / no-unused-vars ─
  // These are read by child components or reserved for future panels.
  const _refs = {
    trackedSummary,
    workingSetCount,
    searchMatchCount,
    nearbyParcelCount,
    isSearchLoading,
    nlQueryLoading,
    workspaceSyncState,
    saveTrackedSelection,
    removeTrackedSelection,
    updateTrackedSelectionStatus,
    focusTrackedParcel,
    mapWorkbench,
    isSuggestLoading,
    suggestions,
    activeSuggestionIndex,
    selectSuggestion,
    setCursorCoords,
  } as const;
  void _refs;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className="flex h-screen flex-col overflow-hidden bg-paper font-sans"
      data-route-id="map"
      data-route-path={pathname}
      aria-label="Atlas map workspace"
    >
      <h1 className="sr-only">Atlas map workspace</h1>

      {/* Top chrome */}
      <AtlasTopChrome
        searchText={searchText}
        onSearchChange={(v) => {
          setSearchText(v);
          setSearchLookupOverride(null);
          setSelectedSuggestion(null);
          setActiveSuggestionIndex(-1);
        }}
        onSearchSubmit={handleSearchSubmit}
        onSearchKeyDown={handleSearchKeyDown}
        analysisText={analysisText}
        onAnalysisChange={setAnalysisText}
        onAnalysisSubmit={handleAnalysisSubmit}
        findInputRef={addressInputRef}
        onFindFocus={() => addressInputRef.current?.focus()}
      />

      {/* Status strip */}
      <AtlasStatusStrip
        viewportLabel={mapState.viewportLabel}
        parcelsText={statusText}
        sourceLabel={sourceLabel}
        syncLabel={dataFreshnessLabel}
        suggestions={suggestionChips}
        onSuggestionClick={(prompt) => {
          setAnalysisText(prompt);
          void handleNlQuery(prompt);
        }}
      />

      {/* Body: LeftRail | Map canvas | Feed panel */}
      <div className="flex min-h-0 flex-1" style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "260px 1fr 360px" }}>
        {/* Left rail */}
        {!isMobile && (
          <AtlasLeftRail
            trackedParcels={trackedParcels}
            onTrackedParcelClick={focusTrackedParcel}
            overlayState={overlays}
            onOverlayToggle={(key) => overlays.toggle(key as Parameters<typeof overlays.toggle>[0])}
          />
        )}

        {/* Map canvas */}
        <div className="relative min-h-0 overflow-hidden bg-paper-map">
          <ParcelMap
            ref={attachMapRef}
            parcels={activeParcels}
            center={mapCenter}
            zoom={mapZoom}
            height="100%"
            showChrome={false}
            polygon={polygon}
            onPolygonDrawn={(coords) => setPolygon(coords)}
            onPolygonCleared={clearPolygon}
            onParcelClick={(id) => {
              mapDispatch({ type: "SELECT_PARCELS", parcelIds: [id] });
              const parcel = activeParcels.find((p) => p.id === id);
              if (parcel?.dealId) router.push(`/deals/${parcel.dealId}`);
            }}
            onSelectionChange={(ids) => {
              mapDispatch({
                type: "SELECT_PARCELS",
                parcelIds: Array.from(ids),
              });
            }}
            onViewStateChange={(center, zoom, bounds) => {
              mapDispatch({
                type: "SET_VIEWPORT",
                center: [center[1], center[0]],
                zoom,
                bounds,
              });
            }}
            onMapReady={() => setIsMapReady(true)}
            onHudStateChange={setMapHudState}
            dataFreshnessLabel={dataFreshnessLabel}
            latencyLabel={latencyLabel}
            selectedParcelIds={selectedParcelIds}
            highlightParcelIds={trackedParcelIds}
            overlayOverrides={(() => {
              const { toggle: _t, activeCount: _c, ...bools } = overlays;
              return bools;
            })()}
          />

          {/* Floating tool rail */}
          <AtlasToolRail
            drawMode={mapHudState.drawMode === "idle" ? "idle" : "select"}
            onZoomIn={() =>
              (
                mapRef.current as (ParcelMapRef & { zoomIn?: () => void }) | null
              )?.zoomIn?.()
            }
            onZoomOut={() =>
              (
                mapRef.current as (ParcelMapRef & { zoomOut?: () => void }) | null
              )?.zoomOut?.()
            }
          />

          {/* Polygon card */}
          {polygonCardData && (
            <AtlasPolygonCard
              parcelCount={polygonCardData.parcelCount}
              totalAcres={polygonCardData.totalAcres}
              ownerCount={polygonCardData.ownerCount}
              onClose={clearPolygon}
              onScreenAll={() => {
                setFeedTab("screening");
              }}
            />
          )}

          {/* HUD */}
          <AtlasHud
            cursor={cursorCoords}
            bbox={mapState.viewportBounds ?? null}
            zoom={mapState.zoom}
          />

          {/* cursor coord tracking reserved for future mousemove handler */}
        </div>

        {/* Right feed panel */}
        {!isMobile && (
          <div className="flex min-h-0 flex-col overflow-hidden bg-paper-panel">
            <AtlasFeedPanel
              tab={feedTab}
              onTabChange={setFeedTab}
              selectedParcel={selectedParcel}
              results={feedResults}
              suggestions={suggestionChips}
              onSuggestionClick={(prompt) => {
                setAnalysisText(prompt);
                void handleNlQuery(prompt);
              }}
              onPlotOnMap={handlePlotFeedResult}
              onDispatchScreening={() => setFeedTab("screening")}
            />
          </div>
        )}
      </div>
    </div>
  );
}
