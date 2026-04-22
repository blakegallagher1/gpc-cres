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
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  Bell,
  Book,
  Building2,
  Camera,
  ChevronDown,
  Layers3,
  Loader2,
  LogOut,
  Map as MapIcon,
  MapPin,
  Maximize2,
  Minus,
  Plus,
  Search,
  Settings,
  Share2,
  SunMedium,
  Upload,
  Workflow,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { MapOperatorConsole } from "@/components/maps/MapOperatorConsole";
import type { ParcelMapRef } from "@/components/maps/ParcelMap";
import { ScreeningScorecard } from "@/components/maps/ScreeningScorecard";
import {
  summarizeTrackedParcels,
  type MapTrackedParcel,
} from "@/components/maps/mapOperatorNotebook";
import type { MapHudState, MapParcel } from "@/components/maps/types";
import { useMapInvestorWorkbench } from "@/components/maps/useMapInvestorWorkbench";
import { useMapTrackedParcelWorkspace } from "@/components/maps/useMapTrackedParcelWorkspace";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { recordClientMetricEvent } from "@/components/observability/client-telemetry";
import { useIsMobile } from "@/hooks/useIsMobile";
import {
  buildMapContextInput,
  useMapChatDispatch,
  useMapChatState,
} from "@/lib/chat/MapChatContext";
import type { MapFeature } from "@/lib/chat/mapActionTypes";
import { mapFeaturesFromGeoJson } from "@/lib/chat/mapFeatureUtils";
import { normalizeParcelId } from "@/lib/maps/parcelIdentity";
import { cn } from "@/lib/utils";
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

const MapChatPanel = dynamic(
  () => import("@/components/maps/MapChatPanel").then((m) => m.MapChatPanel),
  { ssr: false }
);

const MapProspectingPanel = dynamic(
  () => import("@/components/maps/MapProspectingPanel").then((m) => m.MapProspectingPanel),
  { ssr: false }
);

const MapResultCardStack = dynamic(
  () => import("@/components/maps/MapResultCard").then((m) => m.MapResultCardStack),
  { ssr: false }
);

const ParcelMap = dynamic(
  () => import("@/components/maps/ParcelMap").then((m) => m.ParcelMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[calc(100vh-12rem)] items-center justify-center rounded-lg border bg-muted">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    ),
  }
);

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

const SURROUNDING_PARCELS_RADIUS_MILES = 1.25;
const SEARCH_PARAMS_EVENT = "map:search-params-change";

let historySearchParamsPatched = false;
let originalPushState: typeof window.history.pushState | null = null;
let originalReplaceState: typeof window.history.replaceState | null = null;

function emitSearchParamsChange() {
  queueMicrotask(() => {
    window.dispatchEvent(new Event(SEARCH_PARAMS_EVENT));
  });
}

function restoreHistoryMethods() {
  if (!historySearchParamsPatched || typeof window === "undefined") {
    return;
  }

  if (originalPushState) {
    window.history.pushState = originalPushState;
  }
  if (originalReplaceState) {
    window.history.replaceState = originalReplaceState;
  }

  originalPushState = null;
  originalReplaceState = null;
  historySearchParamsPatched = false;
}

function ensureHistorySearchParamsPatched() {
  if (historySearchParamsPatched || typeof window === "undefined") {
    return;
  }

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
  if (typeof window === "undefined") {
    return () => undefined;
  }

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
  if (typeof window === "undefined") {
    return "";
  }
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

function distanceMiles(a: MapParcel, b: MapParcel): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
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
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || params.isContentEditable) {
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

/**
 * Client controller for the interactive `/map` route.
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
  const mapRef = useRef<ParcelMapRef | null>(null);
  const [isMapReady, setIsMapReady] = useState(false);
  const [mapRefVersion, setMapRefVersion] = useState(0);
  const initializedFromUrlRef = useRef(false);
  const [activePanel, setActivePanel] = useState<"chat" | "prospecting" | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sidebarAutoOpenedRef = useRef(false);

  // Force dark mode on map page mount
  useLayoutEffect(() => {
    const root = document.documentElement;
    const previous = {
      dark: root.classList.contains("dark"),
      light: root.classList.contains("light"),
      colorScheme: root.style.colorScheme,
    };

    setTheme("dark");
    root.classList.remove("light");
    root.classList.add("dark");
    root.style.colorScheme = "dark";

    return () => {
      root.classList.remove("dark");
      root.classList.remove("light");
      if (previous.dark) root.classList.add("dark");
      if (previous.light) root.classList.add("light");
      root.style.colorScheme = previous.colorScheme;
    };
  }, [setTheme]);

  // Auto-collapse sidebar on /map (all viewports — map needs maximum canvas)
  useEffect(() => {
    setSidebarCollapsed(true);
    setCopilotOpen(false);
  }, [setCopilotOpen, setSidebarCollapsed]);

  useEffect(() => {
    const mode = searchParams.get("mode");
    if (mode === "prospecting") {
      setActivePanel("prospecting");
    } else if (mode === "chat") {
      setActivePanel("chat");
    }
    // No explicit mode param → leave panel as-is (null on initial load)
  }, [searchParams]);

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
  const [resultCards, setResultCards] = useState<
    Array<import("@/components/maps/MapResultCard").MapResultCardData>
  >([]);
  const [polygon, setPolygon] = useState<number[][][] | null>(null);
  const [polygonParcels, setPolygonParcels] = useState<MapParcel[] | null>(null);
  const [polygonError, setPolygonError] = useState<string | null>(null);
  const [isPolygonLoading, setIsPolygonLoading] = useState(false);
  const lastAutoFocusedSearchRef = useRef("");
  const lastViewportRefreshKeyRef = useRef<string | null>(null);
  const addressInputRef = useRef<HTMLInputElement | null>(null);

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

  useEffect(() => {
    if (isMobile || sidebarAutoOpenedRef.current) {
      return;
    }
    sidebarAutoOpenedRef.current = true;
  }, [isMobile]);

  useEffect(() => {
    const handleKeyDown = (e: Event) => {
      const event = e as unknown as KeyboardEvent;
      const target = event.target as HTMLElement | null;
      const action = getMapPageShortcutAction({
        key: event.key,
        tagName: target?.tagName ?? null,
        isContentEditable: target?.isContentEditable ?? null,
      });

      if (!action) {
        return;
      }

      event.preventDefault();
      if (action === "toggle-sidebar") {
        setSidebarOpen((prev) => !prev);
        return;
      }

      if (action === "zoom-in") {
        (mapRef.current as (ParcelMapRef & { zoomIn?: () => void; zoomOut?: () => void }) | null)?.zoomIn?.();
        return;
      }

      if (action === "zoom-out") {
        (mapRef.current as (ParcelMapRef & { zoomIn?: () => void; zoomOut?: () => void }) | null)?.zoomOut?.();
        return;
      }

      mapDispatch({ type: "DESELECT_ALL" });
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mapDispatch]);

  const mapCenter = useMemo<[number, number]>(
    () =>
      mapState.center
        ? [mapState.center[1], mapState.center[0]]
        : initialCenterFromUrl,
    [initialCenterFromUrl, mapState.center],
  );
  // Clamp to at least 11 — parcel tiles have minzoom 10 and MapLibre's vector
  // source gets stuck when initialized below it. Zoom 11 is the safe default.
  const PARCEL_MIN_INIT_ZOOM = 11;
  const rawZoom = mapState.zoom ?? initialZoomFromUrl ?? PARCEL_MIN_INIT_ZOOM;
  const mapZoom = Math.max(rawZoom, PARCEL_MIN_INIT_ZOOM);
  const authDisabledHint =
    process.env.NODE_ENV !== "production"
      ? " Start the dev server with NEXT_PUBLIC_DISABLE_AUTH=true or sign in."
      : " Please sign in and try again.";

  const focusCoordinates = useCallback(
    (lat: number, lng: number) => {
      const nextZoom = typeof mapZoom === "number" ? Math.max(mapZoom, 16) : 16;
      mapDispatch({
        type: "SET_VIEWPORT",
        center: [lng, lat],
        zoom: nextZoom,
      });
      mapRef.current?.flyTo({
        center: [lng, lat],
        zoom: nextZoom,
      });
    },
    [mapDispatch, mapZoom],
  );

  const focusParcel = useCallback(
    (parcel: MapParcel) => {
      mapDispatch({
        type: "SELECT_PARCELS",
        parcelIds: [parcel.id],
      });
      mapRef.current?.highlightParcels([parcel.id], "outline", undefined, 0);
      focusCoordinates(parcel.lat, parcel.lng);
    },
    [focusCoordinates, mapDispatch],
  );

  const markRequestComplete = useCallback((startedAt: number) => {
    setLastRequestLatencyMs(Math.max(1, Date.now() - startedAt));
    setLastDataRefreshAt(Date.now());
  }, []);

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
      // Cached zoom from a previous session is too low for parcel tiles —
      // bump it up so tiles load on first render
      mapDispatch({
        type: "SET_VIEWPORT",
        center: mapState.center,
        zoom: PARCEL_MIN_INIT_ZOOM,
      });
    }

    if (mapState.selectedParcelIds.length === 0) {
      const selectedParcelId = searchParams.get("parcel");
      if (selectedParcelId) {
        mapDispatch({
          type: "SELECT_PARCELS",
          parcelIds: [selectedParcelId],
        });
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

  // Track the last NL query's conversation ID for "Continue in chat"
  const lastNlConversationIdRef = useRef<string | null>(null);

  // Send NL query to agent and parse results into cards
  const handleNlQuery = useCallback(async (query: string) => {
    setNlQueryLoading(true);
    try {
      const mapContextInput = buildMapContextInput(mapState);
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: query,
          mapContext: mapContextInput,
        }),
      });
      if (!res.ok || !res.body) {
        setNlQueryLoading(false);
        return;
      }
      // Parse SSE stream — collect text, tool results, map actions, and conversation ID
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      let buffer = "";
      let conversationId: string | null = null;
      const toolRows: Array<Record<string, unknown>> = [];
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
            // Handle map actions from tool results
            if (event.type === "map_action" && event.payload) {
              mapDispatch({ type: "MAP_ACTION_RECEIVED", payload: event.payload });
            }
            // Collect text deltas
            const textDelta = extractNlQueryTextDelta(event);
            if (textDelta) {
              fullText += textDelta;
            }
            // Handle full text output
            const finalText = extractNlQueryFinalText(event);
            if (finalText) {
              fullText = finalText;
            }
            // Capture tool results with row data (from SQL queries)
            const parsedRows = extractNlQueryRows(event);
            if (parsedRows) {
              toolRows.push(...parsedRows.rows);
              if (typeof parsedRows.rowCount === "number") {
                rowCount = parsedRows.rowCount;
              }
            }
            // Capture conversation ID from done event
            if (event.type === "done" && event.conversationId) {
              conversationId = event.conversationId;
              lastNlConversationIdRef.current = conversationId;
            }
          } catch {
            // Skip malformed events
          }
        }
      }

      // Build a result card from the agent response + tool data
      if (fullText.trim() || toolRows.length > 0) {
        const cardId = `nl-${Date.now()}`;
        const cardTitle = query.length > 60 ? `${query.slice(0, 57)}...` : query;

        // Try to build a structured table card from SQL rows
        let columns: Array<{ key: string; label: string; align?: "left" | "right" }> | undefined;
        let rows: Array<Record<string, string | number | null>> | undefined;
        let stats: Array<{ label: string; value: string | number }> | undefined;
        let cardType: "count" | "list" | "detail" = "count";

        if (toolRows.length > 0) {
          // Infer columns from first row
          const firstRow = toolRows[0];
          const keys = Object.keys(firstRow);
          columns = keys.map((key) => ({
            key,
            label: key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
            align: (typeof firstRow[key] === "number" ? "right" : "left") as "left" | "right",
          }));
          rows = toolRows.map((r) => {
            const mapped: Record<string, string | number | null> = {};
            for (const key of keys) {
              const v = r[key];
              mapped[key] = typeof v === "number" ? Math.round(v * 100) / 100
                : v == null ? null
                : String(v);
            }
            return mapped;
          });
          cardType = toolRows.length === 1 ? "detail" : "list";

          // Build stats from aggregate queries (single-row results with count-like columns)
          if (toolRows.length <= 3 && keys.some((k) => /cnt|count|total|avg|sum/i.test(k))) {
            stats = [];
            for (const row of toolRows) {
              for (const key of keys) {
                const v = row[key];
                if (v != null) {
                  stats.push({
                    label: key.replace(/_/g, " "),
                    value: typeof v === "number" ? v.toLocaleString() : String(v),
                  });
                }
              }
            }
            cardType = "count";
          }
        }

        const subtitle = rowCount != null
          ? `${rowCount} result${rowCount !== 1 ? "s" : ""}`
          : toolRows.length > 0
          ? `${toolRows.length} result${toolRows.length !== 1 ? "s" : ""}`
          : "AI Analysis";

        setResultCards((prev) => [
          ...prev,
          {
            id: cardId,
            title: cardTitle,
            subtitle,
            stats,
            columns,
            rows,
            narrative: fullText.trim().slice(0, 1000) || undefined,
            type: cardType,
          },
        ]);
      }
    } catch (err) {
      console.error("[map] NL query failed:", err);
    } finally {
      setNlQueryLoading(false);
    }
  }, [mapState, mapDispatch]);

  const handleSearchSubmit = (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const nextSearch = searchText.trim();
    if (!nextSearch) return;

    setSearchLookupOverride(null);
    setSelectedSuggestion(null);
    setDebouncedSearch(nextSearch);
    setSearchSubmitId((value) => value + 1);
    setSuggestions([]);
    setActiveSuggestionIndex(-1);
  };

  const handleAnalysisSubmit = useCallback((event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const nextPrompt = analysisText.trim();
    if (!nextPrompt) return;

    if (isLikelyParcelLookupQuery(nextPrompt) && !isLikelyMapAnalysisQuery(nextPrompt)) {
      setSearchText(nextPrompt);
      setAnalysisText("");
      setSearchLookupOverride(null);
      setSelectedSuggestion(null);
      setDebouncedSearch(nextPrompt);
      setSearchSubmitId((value) => value + 1);
      setSuggestions([]);
      setActiveSuggestionIndex(-1);
      addressInputRef.current?.focus();
      return;
    }

    setAnalysisText("");
    void handleNlQuery(nextPrompt);
  }, [analysisText, handleNlQuery]);

  const selectSuggestion = useCallback((suggestion: ParcelSearchSuggestion) => {
    const nextSearch = suggestion.address.trim();
    if (!nextSearch) return;
    const nextLookupText = buildSuggestionLookupText(suggestion);
    const canonicalSuggestionParcelId =
      normalizeParcelId(suggestion.parcelId ?? suggestion.propertyDbId ?? suggestion.id ?? nextLookupText) ??
      nextLookupText;
    const resolvedParcel =
      resolveSuggestionParcel(suggestion, searchParcels ?? []) ??
      resolveSuggestionParcel(suggestion, parcels);

    setSearchText(nextSearch);
    setSearchLookupOverride(nextLookupText);
    setDebouncedSearch(nextLookupText);
    setSearchSubmitId((value) => value + 1);
    setSuggestions([]);
    setActiveSuggestionIndex(-1);
    setSelectedSuggestion(resolvedParcel ? null : suggestion);
    pendingSelectionMetricRef.current = {
      parcelId: canonicalSuggestionParcelId,
      source: "search",
      startedAt: typeof performance !== "undefined" ? performance.now() : Date.now(),
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
  }, [
    focusCoordinates,
    focusParcel,
    parcels,
    searchParcels,
    selectedParcelIds.size,
  ]);

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

  const submitSearch = () => {
    handleSearchSubmit();
  };

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
        const localFallback = next.length === 0
          ? parcels
              .filter((parcel) => parcelMatchesSearch(parcel, query))
              .slice(0, 8)
              .map((parcel) => ({
                id: parcel.id,
                parcelId: parcel.parcelId,
                address: parcel.address,
                lat: parcel.lat,
                lng: parcel.lng,
                propertyDbId: parcel.propertyDbId ?? null,
                hasGeometry: parcel.hasGeometry ?? true,
                owner: parcel.owner ?? null,
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
        if (active) {
          setIsSuggestLoading(false);
        }
      }
    }, 160);

    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [parcels, searchText]);

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
        (typeof p.geometryLookupKey === "string" && p.geometryLookupKey.trim().length > 0
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
    [debouncedSearch, markRequestComplete]
  );

  const visibleParcels = useMemo(() => {
    const query = debouncedSearch.toLowerCase();
    if (!query) {
      return parcels;
    }

    if (!searchParcels || searchParcels.length === 0) {
      return [];
    }

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
  const hasActionableGeography = Boolean(polygon) || workingSetCount > 0;
  const showSuggestionSurface =
    searchText.trim().length >= 2 && (isSuggestLoading || suggestions.length > 0);

  const nearbyParcelCount = useMemo(() => {
    if (!isSearchActive || !searchParcels || searchParcels.length === 0) return 0;
    const matchIds = new Set(searchParcels.map((parcel) => parcel.id));
    return visibleParcels.reduce(
      (count, parcel) => (matchIds.has(parcel.id) ? count : count + 1),
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
      resultCards.map((card) => ({
        id: card.id,
        title: card.title,
        createdAt: new Date().toISOString(),
        summary:
          card.narrative?.trim() ||
          card.subtitle ||
          `${card.stats?.length ?? 0} stats · ${card.rows?.length ?? 0} rows`,
        payload: {
          subtitle: card.subtitle ?? null,
          type: card.type ?? null,
          statCount: card.stats?.length ?? 0,
          rowCount: card.rows?.length ?? 0,
        },
      })),
    [resultCards],
  );
  const {
    trackedParcels,
    workspaceSyncState,
    workspaceSyncMessage,
    reloadWorkspace,
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
          if (activeParcel) {
            return activeParcel;
          }

          const trackedParcel = trackedParcelsById.get(parcelId);
          return trackedParcel ? trackedParcelToMapParcel(trackedParcel) : null;
        })
        .filter((parcel): parcel is MapParcel => Boolean(parcel)),
    [activeParcelsByKey, mapState.selectedParcelIds, trackedParcelsById],
  );
  const mapWorkbench = useMapInvestorWorkbench({
    activeParcels,
    selectedParcels,
    trackedParcels,
    hudState: mapHudState,
    polygon,
    resultCount: resultCards.length,
  });

  const focusTrackedParcel = useCallback(
    (entry: MapTrackedParcel) => {
      const parcel = activeParcelsByKey.get(entry.parcelId);
      if (parcel) {
        focusParcel(parcel);
        return;
      }

      mapDispatch({
        type: "SELECT_PARCELS",
        parcelIds: [entry.parcelId],
      });
      mapRef.current?.highlightParcels([entry.parcelId], "outline", undefined, 0);
      focusCoordinates(entry.lat, entry.lng);
    },
    [activeParcelsByKey, focusCoordinates, focusParcel, mapDispatch],
  );

  useEffect(() => {
    const selectedFeatures = selectedParcels.map(mapParcelToFeature);

    mapDispatch({
      type: "SET_SELECTED_PARCEL_FEATURES",
      features: selectedFeatures,
    });
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
      startedAt: typeof performance !== "undefined" ? performance.now() : Date.now(),
      initialSelectedCount: selectedParcelIds.size,
    };
    focusParcel(resolvedParcel);
    setSelectedSuggestion(null);
  }, [activeParcels, focusParcel, parcels, searchParcels, selectedParcelIds.size, selectedSuggestion]);

  useEffect(() => {
    if (polygon) {
      lastViewportRefreshKeyRef.current = null;
    }
  }, [polygon]);

  useEffect(() => {
    async function loadBaseParcels() {
      const startedAt = Date.now();
      try {
        const res = await fetch("/api/parcels?hasCoords=true");
        if (!res.ok) {
          setLoadError(
            res.status === 401
              ? `Unauthorized.${authDisabledHint}`
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
        if (data.error) {
          setLoadError(data.error);
        }
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
    loadBaseParcels();
  }, [markRequestComplete]);

  useEffect(() => {
    const bounds = mapState.viewportBounds;
    if (polygon || !bounds) {
      return;
    }

    const { west, south, east, north } = bounds;
    const boundsForRefresh = { west, south, east, north };
    const viewportKey = [west, south, east, north]
      .map((value) => value.toFixed(5))
      .join(":");
    if (lastViewportRefreshKeyRef.current === viewportKey) {
      return;
    }
    lastViewportRefreshKeyRef.current = viewportKey;

    let active = true;

    async function refreshViewportParcels() {
      const startedAt = Date.now();
      try {
        const result = await requestViewportParcels({
          bounds: boundsForRefresh,
        });
        if (!active) {
          return;
        }
        if (result.error) {
          if (result.unauthorized) {
            setLoadError(`Unauthorized.${authDisabledHint}`);
          }
          return;
        }
        setLoadError(null);
        setParcels(result.parcels);
        markRequestComplete(startedAt);
      } catch {
        if (active && parcels.length === 0) {
          setLoadError("Failed to refresh viewport parcels. Please try again.");
        }
      }
    }

    void refreshViewportParcels();

    return () => {
      active = false;
    };
  }, [authDisabledHint, mapState.viewportBounds, markRequestComplete, parcels.length, polygon]);

  useEffect(() => {
    const next = new URLSearchParams(searchParams.toString());
    if (mapState.center) {
      next.set("lat", mapState.center[1].toFixed(6));
      next.set("lng", mapState.center[0].toFixed(6));
    }
    if (typeof mapState.zoom === "number") {
      next.set("z", mapState.zoom.toFixed(2));
    }
    if (mapState.selectedParcelIds.length === 1) {
      next.set("parcel", mapState.selectedParcelIds[0]);
    } else {
      next.delete("parcel");
    }
    router.replace(`/map?${next.toString()}`);
  }, [mapState.center, mapState.selectedParcelIds, mapState.zoom, router, searchParams]);

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
        const qs = new URLSearchParams({
          hasCoords: "true",
          search: debouncedSearch,
        });
        const res = await fetch(`/api/parcels?${qs.toString()}`);
        if (!res.ok || !active) {
          if (active) {
            setSearchParcels([]);
            if (res.status === 401) {
              setLoadError(`Unauthorized.${authDisabledHint}`);
            }
          }
          return;
        }
        const data = (await res.json()) as ParcelsApiResponse;
        if (!active) return;
        if (data.error) {
          setLoadError(data.error);
        } else {
          setLoadError(null);
        }
        setSource(
          data.source === "property-db" || data.source === "org-fallback"
            ? data.source
            : "org",
        );
        const mapped = mapApiParcels(data);
        const localMatches =
          mapped.length === 0
            ? parcels.filter((parcel) => parcelMatchesSearch(parcel, debouncedSearch))
            : [];
        const effectiveResults =
          mapped.length === 0 && localMatches.length > 0 ? localMatches : mapped;
        if (mapped.length === 0 && data.parcels.length > 0) {
          setLoadError(
            "Search returned parcels without usable coordinates (lat/lng).",
          );
        }
        if (mapped.length === 0 && localMatches.length > 0) {
          setLoadError(null);
        }
        setSearchParcels(effectiveResults);
        markRequestComplete(startedAt);
      } catch {
        if (active) {
          setSearchParcels([]);
          setLoadError("Search failed. Please try again.");
        }
      } finally {
        if (active) {
          setIsSearchLoading(false);
        }
      }
    }
    void loadSearchParcels();
    return () => {
      active = false;
    };
  }, [debouncedSearch, markRequestComplete, parcels, searchSubmitId, polygon]);

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

  useEffect(() => {
    if (!polygon) {
      setPolygonParcels(null);
      setPolygonError(null);
      setIsPolygonLoading(false);
      return;
    }
    void loadPolygonParcels(polygon);
  }, [polygon, debouncedSearch, searchSubmitId, loadPolygonParcels]);

  useEffect(() => {
    const previousSelected = previousSelectedParcelIdsRef.current;
    const nextSelected = mapState.selectedParcelIds;
    const addedParcelIds = nextSelected.filter((parcelId) => !previousSelected.includes(parcelId));
    const pendingMetric = pendingSelectionMetricRef.current;

    if (
      pendingMetric &&
      selectedParcelIds.has(pendingMetric.parcelId) &&
      nextSelected.length > pendingMetric.initialSelectedCount
    ) {
      const completedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
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
        metadata: {
          source: "map",
          addedParcelIds,
          workingSetCount: nextSelected.length,
        },
      });
    }

    previousSelectedParcelIdsRef.current = nextSelected;
  }, [mapState.selectedParcelIds, selectedParcelIds]);

  const clearPolygon = () => {
    setPolygon(null);
    setPolygonParcels(null);
    setPolygonError(null);
    setIsPolygonLoading(false);
  };

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
    if (hasNoSearchResults) {
      return "No Baton Rouge parcels with verified geometry matched that lookup. Try a broader local address, parcel id, or owner name.";
    }
    if (parcels.length === 0) {
      return "Verified parcel geometry is temporarily unavailable. Search by address, open copilot, or use prospecting while the parcel layer recovers.";
    }
    if (source === "org-fallback") {
      return `${visibleParcels.length} of ${parcels.length} parcels (property database fallback)`;
    }
    return `${visibleParcels.length} of ${parcels.length} parcels with coordinates`;
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

  const dataFreshnessLabel = useMemo(() => {
    if (!lastDataRefreshAt) return "No sync yet";
    const diffSeconds = Math.floor((Date.now() - lastDataRefreshAt) / 1000);
    if (diffSeconds < 5) return "Live";
    if (diffSeconds < 60) return `${diffSeconds}s ago`;
    return `${Math.floor(diffSeconds / 60)}m ago`;
  }, [lastDataRefreshAt, parcels.length, searchParcels?.length]);

  const latencyLabel = useMemo(() => {
    if (lastRequestLatencyMs == null) return "n/a";
    return `${lastRequestLatencyMs}ms`;
  }, [lastRequestLatencyMs]);
  const sourceLabel = useMemo(() => {
    if (source === "org-fallback") {
      return "Source: Org fallback";
    }
    if (source === "property-db") {
      return "Source: Property database";
    }
    return "Source: Org parcels";
  }, [source]);

  useEffect(() => {
    if (mapState.viewportLabel === statusText) return;
    mapDispatch({ type: "SET_VIEWPORT_LABEL", label: statusText });
  }, [mapDispatch, mapState.viewportLabel, statusText]);

  useEffect(() => {
    mapDispatch({
      type: "SET_SPATIAL_SELECTION",
      selection: polygon
        ? {
            kind: "polygon",
            coordinates: polygon,
            parcelIds: polygonParcels?.map((parcel) => parcel.id),
            label: statusText,
          }
        : null,
    });
  }, [mapDispatch, polygon, polygonParcels, statusText]);

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
        mapDispatch({
          type: "SELECT_PARCELS",
          parcelIds: nextAction.parcelIds,
        });
      }
    }

    if (nextAction.action === "flyTo") {
      mapRef.current.flyTo({
        center: nextAction.center,
        zoom: nextAction.zoom ?? 15,
      });
      if (nextAction.parcelId) {
        mapDispatch({
          type: "SELECT_PARCELS",
          parcelIds: [nextAction.parcelId],
        });
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

  const attachMapRef = useCallback((instance: ParcelMapRef | null) => {
    mapRef.current = instance;
    if (!instance) {
      setIsMapReady(false);
    }
    setMapRefVersion((value) => value + 1);
  }, []);

  const shellRef = useRef<HTMLDivElement | null>(null);
  const railItems = [
    { href: "/map", label: "Map", icon: MapIcon },
    { href: "/runs", label: "Runs", icon: Building2 },
    { href: "/saved-searches", label: "Parcels", icon: Book },
    { href: "/workflows", label: "Workflows", icon: Workflow },
    { href: "/prospecting", label: "Prospecting", icon: Search },
    { href: "/analytics", label: "Analytics", icon: BarChart3 },
    { href: "/market", label: "Live", icon: Activity },
    { href: "/evidence", label: "Exports", icon: Upload },
    { href: "/settings", label: "Settings", icon: Settings },
  ] as const;
  const legendItems = [
    { label: "Industrial (M1, M2, M3)", color: "bg-[#4567ff]" },
    { label: "Commercial (C1-C5)", color: "bg-[#f0b441]" },
    { label: "Residential (A1-A5, RE)", color: "bg-[#51b55b]" },
    { label: "Buffer (B1)", color: "bg-[#858b97]" },
    { label: "Planned Unit Dev (PUD)", color: "bg-[#5d47d7]" },
    { label: "Unknown", color: "bg-[#c6cad3]" },
    { label: "Wetlands", color: "bg-[#4d89d8]" },
  ] as const;

  const handleShareMap = useCallback(async () => {
    const url =
      typeof window !== "undefined" ? window.location.href : "https://gallagherpropco.com/map";
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title: "Gallagher Map", url });
        return;
      } catch {
        // Fall through to clipboard copy.
      }
    }

    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
    }
  }, []);

  const handleFullscreen = useCallback(async () => {
    if (!shellRef.current) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    await shellRef.current.requestFullscreen();
  }, []);

  const handleLocateUser = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((position) => {
      focusCoordinates(position.coords.latitude, position.coords.longitude);
    });
  }, [focusCoordinates]);

  return (
    <div
      ref={shellRef}
      className="map-page min-h-screen bg-[#06080d] text-map-text-primary"
      data-route-id="map"
      data-route-path={pathname}
      aria-label="Map workspace"
    >
      <h1 className="sr-only">Map workspace</h1>
      <div className="flex min-h-screen">
        <aside className="hidden w-[124px] shrink-0 flex-col border-r border-white/8 bg-[#080b11] px-4 py-5 md:flex">
          <div className="flex flex-1 flex-col gap-4.5">
            {railItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || (item.href !== "/map" && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex flex-col items-center gap-3 rounded-[26px] border px-3 py-4.5 text-center transition-colors",
                    isActive
                      ? "border-white/16 bg-white/10 text-white shadow-[0_24px_48px_-30px_rgba(0,0,0,0.9)]"
                      : "border-white/8 bg-white/[0.03] text-white/60 hover:border-white/14 hover:bg-white/[0.05] hover:text-white",
                  )}
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03]">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="text-[13px] font-medium tracking-[-0.01em]">{item.label}</span>
                </Link>
              );
            })}
          </div>
          <div className="mt-6 flex h-20 w-20 items-center justify-center self-center rounded-full border border-white/12 bg-[#0b0f16] text-[2rem] font-semibold text-white/90">
            G
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="border-b border-white/8 bg-[#05070b] px-5 py-5 md:px-7 xl:px-8">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="space-y-2.5">
                <p className="font-mono text-[13px] uppercase tracking-[0.38em] text-white/45">
                  Gallagher Property Company Operate
                </p>
                <div className="space-y-1.5">
                  <h2 className="text-[3.2rem] font-semibold tracking-[-0.065em] text-white">Map</h2>
                  <p className="text-[15px] text-white/48">
                    3 routes <span className="mx-3">•</span> Spatial intelligence, prospecting, and parcel analysis
                  </p>
                </div>
              </div>

              <div className="flex flex-1 flex-col gap-3 xl:max-w-[1240px]">
                <div className="flex flex-wrap items-center gap-3 xl:justify-end">
                  <div className="flex min-w-[320px] flex-1 items-center gap-3 rounded-[22px] border border-white/10 bg-white/[0.04] px-5 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] xl:max-w-[840px]">
                    <Search className="h-5 w-5 text-white/45" />
                    <input
                      type="search"
                      value={searchText}
                      onChange={(event) => setSearchText(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          submitSearch();
                        }
                      }}
                      placeholder="Search operates, parcels, runs, and workflows"
                      className="h-9 flex-1 bg-transparent text-[1.05rem] text-white/75 outline-none placeholder:text-white/35"
                    />
                    <div className="hidden items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-1.5 text-right xl:flex">
                      <div>
                        <div className="font-mono text-[18px] leading-none text-white/75">9</div>
                        <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-white/30">
                          Desks
                        </div>
                      </div>
                      <div className="flex items-center gap-1 rounded-xl border border-white/8 bg-white/[0.02] px-2 py-1 text-white/50">
                        <Command className="h-3.5 w-3.5" />
                        <span className="font-mono text-xs">K</span>
                      </div>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-11 w-11 rounded-2xl border-white/12 bg-white/[0.03] text-white/75 hover:bg-white/[0.08] hover:text-white"
                    onClick={() => setTheme("dark")}
                  >
                    <SunMedium className="h-5 w-5" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-11 w-11 rounded-2xl border-white/12 bg-white/[0.03] text-white/75 hover:bg-white/[0.08] hover:text-white"
                  >
                    <Bell className="h-5 w-5" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 rounded-2xl border-white/12 bg-white/[0.03] px-5 text-[1.05rem] text-white/80 hover:bg-white/[0.08] hover:text-white"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign Out
                  </Button>
                  <Button
                    type="button"
                    className="h-12 rounded-2xl bg-white px-6 text-[1.08rem] font-medium text-black hover:bg-white/90"
                    onClick={() => router.push("/chat")}
                  >
                    <Plus className="mr-2 h-5 w-5" />
                    New Run
                  </Button>
                </div>
              </div>
            </div>
          </header>

          <main className="flex-1 p-3 md:p-4 xl:p-5">
            <div className="relative h-full min-h-[780px] overflow-hidden rounded-[28px] border border-white/10 bg-[#070910] shadow-[0_36px_100px_-52px_rgba(0,0,0,1)]">
              <ParcelMap
                ref={attachMapRef}
                parcels={activeParcels}
                center={mapCenter}
                zoom={mapZoom}
                height="100%"
                showChrome={false}
                polygon={polygon}
                onPolygonDrawn={(coords) => {
                  setPolygon(coords);
                }}
                onPolygonCleared={clearPolygon}
                onParcelClick={(id) => {
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
                onMapReady={() => {
                  setIsMapReady(true);
                }}
                onHudStateChange={setMapHudState}
                dataFreshnessLabel={dataFreshnessLabel}
                latencyLabel={latencyLabel}
                selectedParcelIds={selectedParcelIds}
                highlightParcelIds={trackedParcelIds}
              />

              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(2,5,10,0.28)_0%,rgba(2,5,10,0.02)_18%,rgba(2,5,10,0)_42%,rgba(2,5,10,0.42)_100%)]" />

              <div className="pointer-events-none absolute inset-x-4 top-4 z-20 md:inset-x-5 md:top-5">
                <div className="pointer-events-auto flex flex-wrap items-center gap-3 rounded-[24px] border border-white/12 bg-[#0a0e15]/95 px-4 py-3 shadow-[0_26px_70px_-40px_rgba(0,0,0,0.95)] backdrop-blur-md md:px-5">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-[58px] rounded-2xl border-white/12 bg-white/[0.03] px-5 text-[1.02rem] text-white/80 hover:bg-white/[0.08] hover:text-white"
                  >
                    <Layers3 className="mr-2 h-5 w-5" />
                    Layers
                    <ChevronDown className="ml-3 h-4 w-4" />
                  </Button>
                  <form
                    onSubmit={handleSearchSubmit}
                    className="flex min-w-[280px] flex-1 items-center gap-3 rounded-[18px] border border-white/10 bg-white/[0.03] px-4 py-2.5"
                  >
                    <Search className="h-5 w-5 text-white/40" />
                    <input
                      type="search"
                      value={searchText}
                      onChange={(event) => {
                        setSearchText(event.target.value);
                        setSearchLookupOverride(null);
                        setSelectedSuggestion(null);
                        setActiveSuggestionIndex(-1);
                      }}
                      onKeyDown={handleSearchKeyDown}
                      placeholder="Search address, parcel, or owner"
                      className="h-10 flex-1 bg-transparent text-[1.05rem] text-white/75 outline-none placeholder:text-white/35"
                    />
                  </form>
                  <Button
                    type="button"
                    className="h-[58px] rounded-2xl border border-cyan-400/55 bg-[#0d1620] px-6 text-[1.02rem] text-white shadow-[inset_0_0_0_1px_rgba(6,182,212,0.32)] hover:bg-[#13202e]"
                    onClick={() => setSidebarOpen((value) => !value)}
                  >
                    {sidebarOpen ? "Close console" : "Open console"}
                  </Button>
                  <Button
                    type="button"
                    className="h-[58px] rounded-2xl border border-[#8dc15c]/35 bg-[#12180f] px-6 text-[1.02rem] text-white shadow-[inset_0_0_0_1px_rgba(141,193,92,0.2)] hover:bg-[#182112]"
                    onClick={() => setActivePanel((value) => (value === "chat" ? null : "chat"))}
                  >
                    {activePanel === "chat" ? "Close copilot" : "Open copilot"}
                  </Button>
                  <Button
                    type="button"
                    className="h-[58px] rounded-2xl border border-[#7453df]/35 bg-[#16111f] px-6 text-[1.02rem] text-white shadow-[inset_0_0_0_1px_rgba(116,83,223,0.22)] hover:bg-[#1d1628]"
                    onClick={() =>
                      setActivePanel((value) => (value === "prospecting" ? null : "prospecting"))
                    }
                  >
                    {activePanel === "prospecting" ? "Close prospecting" : "Open prospecting"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-[58px] rounded-2xl border-white/12 bg-white/[0.03] px-5 text-[1.02rem] text-white/80 hover:bg-white/[0.08] hover:text-white"
                    onClick={() => void handleShareMap()}
                  >
                    <Share2 className="mr-2 h-4 w-4" />
                    Share
                  </Button>
                </div>
              </div>

              <div className="pointer-events-none absolute left-4 top-[92px] z-20 hidden w-[476px] xl:block">
                <div className="pointer-events-auto rounded-[26px] border border-white/12 bg-[#111720]/96 shadow-[0_30px_90px_-46px_rgba(0,0,0,1)] backdrop-blur-md">
                  <div className="space-y-5 border-b border-white/10 px-5 py-5">
                    <div className="space-y-3">
                      <p className="font-mono text-[13px] uppercase tracking-[0.28em] text-white/48">
                        Geography Workbench
                      </p>
                      <div className="space-y-3">
                        <h3 className="max-w-[12ch] text-[3.05rem] font-semibold leading-[0.98] tracking-[-0.065em] text-white">
                          Run the geography workflow from one panel.
                        </h3>
                        <p className="max-w-[30ch] text-[15px] leading-7 text-white/43">
                          Search, build the working set, tune layers, and move into analysis without breaking focus.
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: "Screenshot", icon: Camera, onClick: () => void handleShareMap() },
                        { label: "Fullscreen", icon: Maximize2, onClick: () => void handleFullscreen() },
                        { label: "Share Map", icon: Share2, onClick: () => void handleShareMap() },
                      ].map((action) => {
                        const Icon = action.icon;
                        return (
                          <Button
                            key={action.label}
                            type="button"
                            variant="outline"
                            className="h-[82px] flex-col gap-3 rounded-[22px] border-white/10 bg-white/[0.03] text-[15px] text-white/82 hover:bg-white/[0.08] hover:text-white"
                            onClick={action.onClick}
                          >
                            <Icon className="h-5 w-5" />
                            {action.label}
                          </Button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-4 border-b border-white/10 px-5 py-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-2">
                        <p className="font-mono text-[12px] uppercase tracking-[0.28em] text-white/44">
                          Search • Entry point
                        </p>
                        <h4 className="max-w-[10ch] text-[2.15rem] font-semibold leading-[1.02] tracking-[-0.055em] text-white">
                          Find the parcel or place first.
                        </h4>
                        <p className="text-[15px] leading-7 text-white/42">
                          Use parcel lookup to move the map, then refine the display once the target geography is locked.
                        </p>
                      </div>
                      <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-white/75">
                        <Search className="h-5 w-5" />
                      </span>
                    </div>
                    <form onSubmit={handleSearchSubmit} className="space-y-3">
                      <Popover open={showSuggestionSurface}>
                        <PopoverTrigger asChild>
                          <div>
                            <Input
                              ref={addressInputRef}
                              aria-label="Parcel or address search"
                              value={searchText}
                              onChange={(event) => {
                                setSearchText(event.target.value);
                                setSearchLookupOverride(null);
                                setSelectedSuggestion(null);
                                setActiveSuggestionIndex(-1);
                              }}
                              onKeyDown={handleSearchKeyDown}
                              onBlur={() => {
                                setTimeout(() => {
                                  setSuggestions([]);
                                  setActiveSuggestionIndex(-1);
                                }, 120);
                              }}
                              placeholder="Search address, parcel, or owner"
                              className="h-[56px] rounded-[18px] border-white/10 bg-white/[0.03] px-4 text-[1.04rem] text-white placeholder:text-white/32"
                            />
                          </div>
                        </PopoverTrigger>
                        <PopoverContent
                          align="start"
                          className="w-[var(--radix-popover-trigger-width)] rounded-[18px] border-white/10 bg-[#10151d] p-0"
                          onOpenAutoFocus={(event) => event.preventDefault()}
                        >
                          <Command className="bg-[#10151d] text-white">
                            <CommandList className="max-h-56">
                              {isSuggestLoading ? (
                                <div className="px-4 py-3 text-sm text-white/45">Matching addresses...</div>
                              ) : (
                                <>
                                  <CommandEmpty className="py-4 text-sm text-white/45">
                                    No address suggestions
                                  </CommandEmpty>
                                  <CommandGroup heading="Suggested matches">
                                    {suggestions.map((suggestion, index) => (
                                      <CommandItem
                                        key={`${suggestion.id}-${index}`}
                                        value={suggestion.address}
                                        onMouseDown={(event) => event.preventDefault()}
                                        onSelect={() => selectSuggestion(suggestion)}
                                        className={cn(
                                          "px-4 py-3",
                                          index === activeSuggestionIndex
                                            ? "bg-white/10 text-white"
                                            : "text-white/72",
                                        )}
                                      >
                                        <div className="flex min-w-0 flex-col gap-1">
                                          <span className="truncate text-sm font-medium">{suggestion.address}</span>
                                          {suggestion.parcelId || suggestion.propertyDbId ? (
                                            <span className="text-xs text-white/40">
                                              Parcel {suggestion.parcelId ?? suggestion.propertyDbId}
                                            </span>
                                          ) : null}
                                        </div>
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                </>
                              )}
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </form>
                  </div>

                  <div className="space-y-4 border-b border-white/10 px-5 py-5">
                    <div className="space-y-2">
                      <p className="font-mono text-[12px] uppercase tracking-[0.28em] text-white/44">
                        Live geography intelligence
                      </p>
                      <h4 className="max-w-[11ch] text-[2.32rem] font-semibold leading-[1.03] tracking-[-0.055em] text-white">
                        Draw the boundary. Surface the opportunity.
                      </h4>
                      <p className="text-[15px] leading-7 text-white/42">
                        Build the working parcel set, read the live geography, and hand the map context straight into copilot, prospecting, or comparison.
                      </p>
                    </div>

                    <div className="grid grid-cols-4 gap-4 rounded-[20px] border border-[#3b8d54] bg-[#0f1512] px-4 py-4.5">
                      <div>
                        <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/45">Working set</div>
                        <div className="mt-2 text-[2rem] font-semibold tracking-[-0.06em] text-white">{workingSetCount}</div>
                      </div>
                      <div>
                        <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/45">Matches</div>
                        <div className="mt-2 text-[2rem] font-semibold tracking-[-0.06em] text-white">{searchMatchCount}</div>
                      </div>
                      <div>
                        <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/45">Tracked</div>
                        <div className="mt-2 text-[2rem] font-semibold tracking-[-0.06em] text-white">{trackedSummary.totalCount}</div>
                      </div>
                      <div>
                        <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/45">Source</div>
                        <div className="mt-2 text-[1.1rem] font-medium leading-5 text-[#7fdc86]">{sourceLabel}</div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <p className="font-mono text-[12px] uppercase tracking-[0.28em] text-white/44">
                        Parcel lookup
                      </p>
                      <p className="text-[15px] leading-7 text-white/42">
                        Search by address, parcel id, or owner to move the map with a deterministic parcel target.
                      </p>
                      <form onSubmit={handleSearchSubmit} className="flex items-center gap-3">
                        <Input
                          aria-label="Parcel lookup input"
                          value={searchText}
                          onChange={(event) => setSearchText(event.target.value)}
                          placeholder="Search by address, parcel id, or owner"
                          className="h-[56px] rounded-[18px] border-white/10 bg-white/[0.03] px-4 text-[1.04rem] text-white placeholder:text-white/32"
                        />
                        <Button
                          type="submit"
                          size="icon"
                          onClick={submitSearch}
                          disabled={!searchText.trim()}
                          className="h-[56px] w-[56px] rounded-[18px] bg-[#5dc464] text-black hover:bg-[#74d47b]"
                        >
                          {isSearchLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowUpRight className="h-5 w-5" />}
                        </Button>
                      </form>
                    </div>
                  </div>
                </div>
              </div>

              <AnimatePresence initial={false}>
                {activePanel === "chat" ? (
                  <MapChatPanel
                    key="map-chat-panel"
                    parcelCount={activeParcels.length}
                    selectedCount={selectedParcelIds.size}
                    viewportLabel={statusText}
                    onClose={() => setActivePanel(null)}
                  />
                ) : null}
                {activePanel === "prospecting" ? (
                  <MapProspectingPanel
                    key="map-prospecting-panel"
                    polygon={polygon}
                    onClose={() => setActivePanel(null)}
                  />
                ) : null}
              </AnimatePresence>

              <div className="pointer-events-none absolute right-4 top-[126px] z-20 flex flex-col gap-3 md:right-5">
                <div className="pointer-events-auto overflow-hidden rounded-[22px] border border-white/12 bg-[#0c1018]/92 shadow-[0_20px_40px_-28px_rgba(0,0,0,0.95)]">
                  <button
                    type="button"
                    onClick={() => (mapRef.current as (ParcelMapRef & { zoomIn?: () => void }) | null)?.zoomIn?.()}
                    className="flex h-[48px] w-[54px] items-center justify-center border-b border-white/10 text-white/82 transition-colors hover:bg-white/[0.08] hover:text-white"
                    aria-label="Zoom in"
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => (mapRef.current as (ParcelMapRef & { zoomOut?: () => void }) | null)?.zoomOut?.()}
                    className="flex h-[48px] w-[54px] items-center justify-center text-white/82 transition-colors hover:bg-white/[0.08] hover:text-white"
                    aria-label="Zoom out"
                  >
                    <Minus className="h-5 w-5" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleLocateUser}
                  className="pointer-events-auto flex h-[58px] w-[54px] items-center justify-center rounded-[22px] border border-white/12 bg-[#0c1018]/92 text-white/82 shadow-[0_20px_40px_-28px_rgba(0,0,0,0.95)] transition-colors hover:bg-white/[0.08] hover:text-white"
                  aria-label="Locate user"
                >
                  <MapPin className="h-5 w-5" />
                </button>
              </div>

              <div className="pointer-events-none absolute bottom-[68px] left-4 z-20 hidden rounded-[16px] border border-white/12 bg-[#0a0d13]/88 px-5 py-3 text-lg text-white/78 shadow-[0_18px_40px_-28px_rgba(0,0,0,0.95)] md:block">
                2 mi
              </div>

              <div className="pointer-events-none absolute bottom-[68px] right-4 z-20 hidden w-[270px] rounded-[22px] border border-white/12 bg-[#0a0e15]/94 p-5 shadow-[0_26px_70px_-36px_rgba(0,0,0,1)] xl:block">
                <p className="font-mono text-[13px] uppercase tracking-[0.28em] text-white/45">
                  Active layers
                </p>
                <div className="mt-5 space-y-4.5">
                  {legendItems.map((item) => (
                    <div key={item.label} className="flex items-center gap-4 text-[14px] text-white/78">
                      <span className={cn("h-4 w-4 rounded-full", item.color)} />
                      <span>{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pointer-events-none absolute inset-x-3 bottom-3 z-20 md:inset-x-4">
                <div className="pointer-events-auto flex items-center gap-4 rounded-[18px] border border-white/10 bg-[#0a0d13]/92 px-3 py-2.5 shadow-[0_22px_60px_-34px_rgba(0,0,0,1)]">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 rounded-2xl border-white/12 bg-white/[0.04] px-5 text-base text-white/82 hover:bg-white/[0.08] hover:text-white"
                  >
                    Map Guide
                  </Button>
                  <span className="font-mono text-base text-white/32">
                    {mapState.center
                      ? `${mapState.center[0].toFixed(5)}`
                      : "0.35330"}
                  </span>
                  <div className="ml-auto flex items-center gap-3 text-base text-white/52">
                    <span className="h-3 w-3 rounded-full bg-[#4ed05e]" />
                    Parcels live on the active view
                  </div>
                </div>
              </div>

              <div className="pointer-events-none absolute inset-y-5 right-5 z-30 hidden lg:block">
                <AnimatePresence initial={false}>
                  {sidebarOpen ? (
                    <motion.aside
                      id="map-operator-console"
                      initial={{ opacity: 0, x: 28 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 28 }}
                      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                      className={cn(
                        "pointer-events-auto absolute right-0 top-24 bottom-20 overflow-hidden rounded-[28px] border border-white/12 bg-[#0b1018]/96 shadow-[0_34px_90px_-42px_rgba(0,0,0,1)]",
                        isMobile ? "w-[calc(100vw-2.5rem)]" : "w-[26rem]",
                      )}
                    >
                      <MapOperatorConsole
                        parcels={activeParcels}
                        selectedIds={selectedParcelIds}
                        selectedParcels={selectedParcels}
                        trackedParcels={trackedParcels}
                        visibleCount={activeParcels.length}
                        searchMatchCount={searchMatchCount}
                        nearbyCount={polygon ? activeParcels.length : nearbyParcelCount}
                        resultCount={resultCards.length}
                        statusText={statusText}
                        sourceLabel={sourceLabel}
                        dataFreshnessLabel={dataFreshnessLabel}
                        latencyLabel={latencyLabel}
                        workspace={mapWorkbench.workspace}
                        assemblage={mapWorkbench.assemblage}
                        ownership={mapWorkbench.ownership}
                        comps={mapWorkbench.comps}
                        marketOverlays={mapWorkbench.marketOverlays}
                        activePanel={activePanel}
                        onActivePanelChange={setActivePanel}
                        onFocusParcel={focusParcel}
                        onToggleParcel={(parcelId) => {
                          const next = new Set(selectedParcelIds);
                          if (next.has(parcelId)) {
                            next.delete(parcelId);
                          } else {
                            next.add(parcelId);
                          }
                          mapDispatch({
                            type: "SELECT_PARCELS",
                            parcelIds: Array.from(next),
                          });
                        }}
                        onClearSelection={() => {
                          mapDispatch({ type: "DESELECT_ALL" });
                        }}
                        onSaveSelection={saveTrackedSelection}
                        onFocusTrackedParcel={focusTrackedParcel}
                        onRemoveTrackedParcel={removeTrackedSelection}
                        onUpdateTrackedParcelStatus={updateTrackedSelectionStatus}
                      />
                    </motion.aside>
                  ) : null}
                </AnimatePresence>
              </div>

              {workingSetCount === 1 ? (
                <div className="pointer-events-none absolute left-[470px] bottom-24 z-20 hidden w-[320px] xl:block">
                  <div className="pointer-events-auto rounded-[24px] border border-white/12 bg-[#0b1018]/94 p-4 shadow-[0_26px_70px_-36px_rgba(0,0,0,1)]">
                    <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-white/45">
                      Selection brief
                    </p>
                    <ScreeningScorecard
                      parcelId={Array.from(selectedParcelIds)[0]}
                      className="mt-3"
                    />
                  </div>
                </div>
              ) : null}
            </div>
            {resultCards.length > 0 && (
              <MapResultCardStack
                cards={resultCards}
                onDismiss={(id) => setResultCards((prev) => prev.filter((c) => c.id !== id))}
                onContinueInChat={(card) => {
                  setActivePanel("chat");
                  setResultCards((prev) => prev.filter((c) => c.id !== card.id));
                }}
              />
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
