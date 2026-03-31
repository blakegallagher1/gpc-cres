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
import { Loader2, Search } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { DashboardShell } from "@/components/layout/DashboardShell";
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
    if (selectedParcelIds.size > 0 && !sidebarOpen) {
      setSidebarOpen(true);
    }
  }, [selectedParcelIds.size]);

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
        propertyDbId: parcelId,
        geometryLookupKey: parcelId,
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
      return "No East Baton Rouge parcel geometry is available yet. Load verified parish geometry to enable lookup, highlighting, and working sets.";
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

  return (
    <DashboardShell noPadding>
      <div
        className="map-page relative flex h-[calc(100svh-var(--app-header-height))] flex-col overflow-hidden"
        data-route-id="map"
        data-route-path={pathname}
        aria-label="Map workspace"
      >
        <h1 className="sr-only">Map workspace</h1>
        {!loading && (
          <>
            <div className="relative flex min-h-0 flex-1">
              <div className="relative min-w-0 flex-1">
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
                <ParcelMap
              ref={attachMapRef}
              parcels={activeParcels}
              center={mapCenter}
              zoom={mapZoom}
              height="100%"
              showTools
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
              searchSlot={
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-map-text-muted">
                      Live geography intelligence
                    </p>
                    <h2 className="max-w-[15ch] text-xl font-semibold tracking-[-0.04em] text-map-text-primary">
                      Draw the boundary. Surface the opportunity.
                    </h2>
                    <p className="text-[11px] leading-5 text-map-text-secondary">
                      Build the working parcel set, read the live geography, and hand the map context straight into copilot, prospecting, or comparison.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 border-y border-map-border/80 py-3 text-[10px] sm:grid-cols-4">
                    <div>
                      <div className="map-stat-label">Working set</div>
                      <div className="map-stat-value">{activeParcels.length}</div>
                    </div>
                    <div>
                      <div className="map-stat-label">Matches</div>
                      <div className="map-stat-value">{searchMatchCount}</div>
                    </div>
                    <div>
                      <div className="map-stat-label">Tracked</div>
                      <div className="map-stat-value">{trackedSummary.totalCount}</div>
                    </div>
                    <div>
                      <div className="map-stat-label">Source</div>
                      <div className="map-stat-value">{sourceLabel}</div>
                    </div>
                  </div>
                  <section className="space-y-2 rounded-xl border border-map-border/80 bg-map-surface-overlay/60 p-3">
                    <div className="space-y-1">
                      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-map-text-muted">
                        Parcel lookup
                      </p>
                      <p className="text-[11px] leading-5 text-map-text-secondary">
                        Search by address, parcel id, or owner to move the map with a deterministic parcel target.
                      </p>
                    </div>
                    <form
                      onSubmit={handleSearchSubmit}
                      className="flex flex-col gap-1.5"
                    >
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
                              placeholder="Search by address, parcel id, or owner"
                              className="h-8 border-map-border bg-map-surface text-xs text-map-text-primary placeholder:text-map-text-muted"
                            />
                          </div>
                        </PopoverTrigger>
                        <PopoverContent
                          align="start"
                          className="w-[var(--radix-popover-trigger-width)] border-map-border bg-map-surface p-0"
                          onOpenAutoFocus={(event) => event.preventDefault()}
                        >
                          <Command className="bg-map-surface text-map-text-primary">
                            <CommandList className="max-h-44">
                              {isSuggestLoading ? (
                                <div className="px-3 py-2 text-[10px] text-map-text-muted">
                                  Matching addresses...
                                </div>
                              ) : (
                                <>
                                  <CommandEmpty className="py-3 text-[10px] text-map-text-muted">
                                    No address suggestions
                                  </CommandEmpty>
                                  <CommandGroup heading="Suggested matches">
                                    {suggestions.map((suggestion, index) => (
                                      <CommandItem
                                        key={`${suggestion.id}-${index}`}
                                        value={suggestion.address}
                                        onMouseDown={(event) => event.preventDefault()}
                                        onSelect={() => selectSuggestion(suggestion)}
                                        className={
                                          index === activeSuggestionIndex
                                            ? "bg-map-accent/25 text-map-text-primary"
                                            : "text-map-text-secondary"
                                        }
                                      >
                                        <div className="flex min-w-0 flex-col gap-0.5 py-0.5">
                                          <span className="truncate text-[10px] font-medium">
                                            {suggestion.address}
                                          </span>
                                          {suggestion.parcelId || suggestion.propertyDbId ? (
                                            <span className="text-[9px] text-map-text-muted">
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
                      <div className="flex items-center gap-2">
                        <Button
                          type="submit"
                          size="sm"
                          disabled={!searchText.trim()}
                          onClick={submitSearch}
                          className="map-btn h-7 flex-1 text-xs"
                        >
                          {isSearchLoading ? (
                            <span className="inline-flex items-center gap-2">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Searching
                            </span>
                          ) : (
                            <>
                              <Search className="mr-1.5 h-3 w-3" />
                              Locate parcel
                            </>
                          )}
                        </Button>
                        {polygon ? (
                          <Button
                            type="button"
                            size="sm"
                            className="map-btn h-7 text-xs"
                            onClick={clearPolygon}
                          >
                            Clear boundary
                          </Button>
                        ) : null}
                      </div>
                    </form>
                  </section>

                  <section className="space-y-2 rounded-xl border border-map-border/80 bg-map-surface-overlay/60 p-3">
                    <div className="space-y-1">
                      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-map-text-muted">
                        Analyze this geography
                      </p>
                      <p className="text-[11px] leading-5 text-map-text-secondary">
                        Ask for comparisons, zoning pressure, flood exposure, permit momentum, or the next best parcel move across the active geography.
                      </p>
                    </div>
                    <form onSubmit={handleAnalysisSubmit} className="flex flex-col gap-1.5">
                      <Input
                        aria-label="Map AI analysis"
                        value={analysisText}
                        onChange={(event) => setAnalysisText(event.target.value)}
                        placeholder="Ask for zoning pressure, flood exposure, comps, or next steps"
                        className="h-8 border-map-border bg-map-surface text-xs text-map-text-primary placeholder:text-map-text-muted"
                      />
                      {analysisText.trim() &&
                      isLikelyParcelLookupQuery(analysisText) &&
                      !isLikelyMapAnalysisQuery(analysisText) ? (
                        <p className="text-[10px] text-map-text-muted">
                          Direct addresses and parcel ids will be routed through parcel search instead of AI analysis.
                        </p>
                      ) : !hasActionableGeography ? (
                        <p className="text-[10px] text-map-text-muted">
                          Select a parcel or draw a boundary to activate geography analysis.
                        </p>
                      ) : null}
                      <Button
                        type="submit"
                        size="sm"
                        disabled={!analysisText.trim() || !hasActionableGeography}
                        className="map-btn h-7 text-xs"
                      >
                        {nlQueryLoading ? (
                          <span className="inline-flex items-center gap-2">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Analyzing
                          </span>
                        ) : (
                          "Analyze this geography"
                        )}
                      </Button>
                    </form>
                  </section>
                  <div className="grid grid-cols-3 gap-2 border-t border-map-border pt-3">
                    <div>
                      <div className="map-stat-label">Working set</div>
                      <div className="map-stat-value">{workingSetCount}</div>
                    </div>
                    <div>
                      <div className="map-stat-label">Matches</div>
                      <div className="map-stat-value">{searchMatchCount}</div>
                    </div>
                    <div>
                      <div className="map-stat-label">Nearby</div>
                      <div className="map-stat-value">{polygon ? "Drawn" : nearbyParcelCount}</div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 border-t border-map-border pt-3">
                    <p className="text-[10px] text-map-text-secondary">
                      {statusText}
                      {!polygon && debouncedSearch && !loadError
                        ? ` \u2022 ${nearbyParcelCount} nearby within ${SURROUNDING_PARCELS_RADIUS_MILES} mi`
                        : ""}
                    </p>
                      <div className="flex flex-wrap items-center gap-2 text-[10px] text-map-text-muted">
                        <Badge variant="outline" className="px-2 py-0.5 text-[9px]">
                          {sourceLabel}
                        </Badge>
                        {workingSetCount > 0 ? (
                          <Badge variant="secondary" className="px-2 py-0.5 text-[9px]">
                          {workingSetCount} selected for follow-up
                          </Badge>
                        ) : null}
                        {trackedSummary.openCount > 0 ? (
                          <Badge variant="outline" className="px-2 py-0.5 text-[9px]">
                            {trackedSummary.openCount} open tasks
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                  {workingSetCount === 1 && (
                    <div className="border-t border-map-border pt-3">
                      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-map-text-muted">
                        Selection brief
                      </p>
                      <ScreeningScorecard
                        parcelId={Array.from(selectedParcelIds)[0]}
                        className="mt-2"
                      />
                    </div>
                  )}
                </div>
              }
            />
              </div>
              <div className="pointer-events-none absolute inset-y-3 right-3 z-20 hidden lg:block">
                <motion.button
                  type="button"
                  onClick={() => setSidebarOpen((prev) => !prev)}
                  initial={false}
                  animate={{ x: sidebarOpen ? -412 : 0 }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  className="pointer-events-auto absolute right-0 top-1/2 flex h-14 w-7 -translate-y-1/2 items-center justify-center rounded-l-2xl border border-r-0 border-map-border bg-map-surface-overlay/95 text-map-text-muted shadow-[0_18px_50px_-28px_rgba(15,23,42,0.55)] backdrop-blur-md transition-colors hover:text-map-text-primary"
                  aria-label={sidebarOpen ? "Close console" : "Open console"}
                  aria-expanded={sidebarOpen}
                  aria-controls="map-operator-console"
                  title={sidebarOpen ? "Close operator console" : "Open operator console"}
                >
                  <span className="text-sm leading-none">{sidebarOpen ? "\u203A" : "\u2039"}</span>
                </motion.button>
                <AnimatePresence initial={false}>
                  {sidebarOpen ? (
                    <motion.aside
                      id="map-operator-console"
                      initial={{ opacity: 0, x: 28 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 28 }}
                      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                      className="pointer-events-auto absolute inset-y-0 right-0 w-[25rem] overflow-hidden rounded-[1.6rem] border border-map-border bg-map-surface-overlay/96 shadow-[0_28px_80px_-36px_rgba(15,23,42,0.65)] backdrop-blur-xl"
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
            </div>
          </>
        )}
        {/* NL query result cards */}
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
      </div>
    </DashboardShell>
  );
}
