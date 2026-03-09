"use client";

import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useCallback,
  useMemo,
  useState,
} from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import { Loader2, Search } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import type { MapParcel } from "@/components/maps/ParcelMap";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const MapChatPanel = dynamic(
  () => import("@/components/maps/MapChatPanel").then((m) => m.MapChatPanel),
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
  deal?: { id: string; name: string; sku: string; status: string } | null;
}

interface ParcelsApiResponse {
  parcels: ApiParcel[];
  source?: "org" | "property-db" | "org-fallback";
  error?: string;
}

interface ProspectApiParcel {
  id: string;
  address: string;
  lat: number;
  lng: number;
  acreage: number | null;
  floodZone: string;
  zoning: string;
  propertyDbId: string;
}

interface ProspectApiResponse {
  parcels: ProspectApiParcel[];
  total: number;
  error?: string;
}

interface ParcelSuggestion {
  id: string;
  address: string;
  lat: number | null;
  lng: number | null;
  propertyDbId: string | null;
}

interface ParcelSuggestApiResponse {
  suggestions: ParcelSuggestion[];
}

const SURROUNDING_PARCELS_RADIUS_MILES = 1.25;
const STREET_SUFFIX_CANONICAL: Array<[RegExp, string]> = [
  [/\bdr\b/g, "drive"],
  [/\bst\b/g, "street"],
  [/\brd\b/g, "road"],
  [/\bave\b/g, "avenue"],
  [/\bblvd\b/g, "boulevard"],
  [/\bhwy\b/g, "highway"],
  [/\bln\b/g, "lane"],
];

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

function canonicalizeSearchText(value: string): string {
  let text = value
    .toLowerCase()
    .replace(/[^\w\s#-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  for (const [pattern, replacement] of STREET_SUFFIX_CANONICAL) {
    text = text.replace(pattern, replacement);
  }
  return text.replace(/\s+/g, " ").trim();
}

function parcelMatchesSearch(parcel: MapParcel, query: string): boolean {
  const q = canonicalizeSearchText(query);
  if (!q) return true;
  return [
    parcel.address,
    parcel.currentZoning,
    parcel.floodZone,
    parcel.propertyDbId,
  ].some((value) => {
    if (!value) return false;
    return canonicalizeSearchText(String(value)).includes(q);
  });
}

export default function MapPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setTheme } = useTheme();

  // Force dark mode on map page mount
  useEffect(() => {
    setTheme("dark");
  }, [setTheme]);

  const [parcels, setParcels] = useState<MapParcel[]>([]);
  const [searchParcels, setSearchParcels] = useState<MapParcel[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [searchSubmitId, setSearchSubmitId] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [source, setSource] = useState<"org" | "property-db" | "org-fallback">("org");
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [isSuggestLoading, setIsSuggestLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<ParcelSuggestion[]>([]);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const [polygon, setPolygon] = useState<number[][][] | null>(null);
  const [polygonParcels, setPolygonParcels] = useState<MapParcel[] | null>(null);
  const [polygonError, setPolygonError] = useState<string | null>(null);
  const [isPolygonLoading, setIsPolygonLoading] = useState(false);
  const [trajectoryData, setTrajectoryData] = useState<{
    type: "FeatureCollection";
    features: unknown[];
  } | null>(null);
  const [selectedParcelIds, setSelectedParcelIds] = useState<Set<string>>(new Set());
  const [mapCenter, setMapCenter] = useState<[number, number]>(() => {
    const latStr = searchParams.get("lat");
    const lngStr = searchParams.get("lng");
    if (latStr != null && lngStr != null) {
      const lat = Number(latStr);
      const lng = Number(lngStr);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return [lat, lng];
    }
    return [30.4515, -91.1871]; // Baton Rouge default
  });
  const [mapZoom, setMapZoom] = useState<number | undefined>(() => {
    const zStr = searchParams.get("z");
    if (zStr == null) return undefined;
    const zoom = Number(zStr);
    return Number.isFinite(zoom) ? zoom : undefined;
  });
  const authDisabledHint =
    process.env.NODE_ENV !== "production"
      ? " Start the dev server with NEXT_PUBLIC_DISABLE_AUTH=true or sign in."
      : " Please sign in and try again.";

  const handleSearchSubmit = (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const nextSearch = searchText.trim();
    if (!nextSearch) return;

    setDebouncedSearch(nextSearch);
    setSearchSubmitId((value) => value + 1);
    setSuggestions([]);
    setActiveSuggestionIndex(-1);
  };

  const selectSuggestion = useCallback((suggestion: ParcelSuggestion) => {
    const nextSearch = suggestion.address.trim();
    if (!nextSearch) return;
    setSearchText(nextSearch);
    setDebouncedSearch(nextSearch);
    setSearchSubmitId((value) => value + 1);
    setSuggestions([]);
    setActiveSuggestionIndex(-1);
    if (
      typeof suggestion.lat === "number" &&
      Number.isFinite(suggestion.lat) &&
      typeof suggestion.lng === "number" &&
      Number.isFinite(suggestion.lng)
    ) {
      setMapCenter([suggestion.lat, suggestion.lng]);
      setMapZoom((prev) => (typeof prev === "number" ? Math.max(prev, 14) : 14));
    }
  }, []);

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
      return;
    }

    const timeout = setTimeout(() => {
      setDebouncedSearch(nextSearch);
    }, 250);

    return () => clearTimeout(timeout);
  }, [searchText]);

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
                address: parcel.address,
                lat: parcel.lat,
                lng: parcel.lng,
                propertyDbId: parcel.propertyDbId ?? null,
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

      acc.push({
        id: p.id,
        address: p.address,
        lat,
        lng,
        dealId: p.deal?.id,
        dealName: p.deal?.name,
        dealStatus: p.deal?.status,
        floodZone: p.floodZone ?? null,
        currentZoning: p.currentZoning ?? null,
        propertyDbId: p.propertyDbId ?? null,
        geometryLookupKey:
          p.geometryLookupKey ??
          p.propertyDbId ??
          p.address ??
          null,
        acreage: p.acreage != null ? Number(p.acreage) : null,
      });

      return acc;
    }, []);

  const mapProspectParcels = (data: ProspectApiResponse): MapParcel[] =>
    (data.parcels as ProspectApiParcel[]).reduce<MapParcel[]>((acc, p) => {
      const lat = Number(p.lat);
      const lng = Number(p.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return acc;

      const propertyDbId = (p.propertyDbId ?? "").trim() || null;
      const id =
        (p.id ?? "").trim() ||
        propertyDbId ||
        `${lat.toFixed(6)}:${lng.toFixed(6)}:${(p.address ?? "").trim() || "parcel"}`;

      acc.push({
        id,
        address: (p.address ?? "Unknown").trim(),
        lat,
        lng,
        floodZone: (p.floodZone ?? "").trim() || null,
        currentZoning: (p.zoning ?? "").trim() || null,
        propertyDbId,
        geometryLookupKey: propertyDbId ?? id,
        acreage: p.acreage != null ? Number(p.acreage) : null,
      });

      return acc;
    }, []);

  const loadPolygonParcels = useCallback(
    async (coords: number[][][]) => {
    setIsPolygonLoading(true);
    setPolygonError(null);
    try {
      const res = await fetch("/api/map/prospect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          polygon: { type: "Polygon", coordinates: coords },
          filters: {
            searchText: debouncedSearch.trim() ? debouncedSearch.trim() : "*",
          },
        }),
      });

      if (!res.ok) {
        setPolygonParcels([]);
        setPolygonError(
          res.status === 401
            ? "You must be signed in to use polygon search."
            : "Polygon search failed. Please try again."
        );
        return;
      }

      const data = (await res.json()) as ProspectApiResponse;
      if (data.error) {
        setPolygonParcels([]);
        setPolygonError(data.error);
        return;
      }

      setPolygonParcels(mapProspectParcels(data));
    } catch {
      setPolygonParcels([]);
      setPolygonError("Polygon search failed. Please try again.");
    } finally {
      setIsPolygonLoading(false);
    }
    },
    [debouncedSearch]
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

  useEffect(() => {
    async function loadBaseParcels() {
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
        setParcels(mapped);
      } catch {
        setLoadError("Failed to load parcels. Please refresh and try again.");
      } finally {
        setLoading(false);
      }
    }
    loadBaseParcels();
  }, []);

  useEffect(() => {
    const next = new URLSearchParams(searchParams.toString());
    if (mapCenter) {
      next.set("lat", mapCenter[0].toFixed(6));
      next.set("lng", mapCenter[1].toFixed(6));
    }
    if (typeof mapZoom === "number") {
      next.set("z", mapZoom.toFixed(2));
    }
    if (selectedParcelIds.size === 1) {
      next.set("parcel", Array.from(selectedParcelIds)[0]);
    } else {
      next.delete("parcel");
    }
    router.replace(`/map?${next.toString()}`);
  }, [mapCenter, mapZoom, selectedParcelIds, router, searchParams]);

  useEffect(() => {
    let active = true;
    async function loadSearchParcels() {
      if (polygon) {
        setSearchParcels(null);
        setIsSearchLoading(false);
        return;
      }

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
  }, [debouncedSearch, parcels, searchSubmitId, polygon]);

  useEffect(() => {
    if (!polygon) {
      setPolygonParcels(null);
      setPolygonError(null);
      setIsPolygonLoading(false);
      return;
    }
    void loadPolygonParcels(polygon);
  }, [polygon, debouncedSearch, searchSubmitId, loadPolygonParcels]);

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
      return "No parcels found for that search. Try a broader address, parcel number, or owner name.";
    }
    if (parcels.length === 0) {
      return "No parcels with coordinates are available yet. Enrich parcel coordinates to enable map search and boundaries.";
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

  return (
    <DashboardShell noPadding>
      <div className="map-page h-screen flex flex-col relative">
        {!loading && (
          <>
            <MapChatPanel
              onGeoJsonReceived={setTrajectoryData}
              parcelCount={activeParcels.length}
              selectedCount={selectedParcelIds.size}
              viewportLabel={statusText}
              mapContext={{
                center: mapCenter ? { lat: mapCenter[0], lng: mapCenter[1] } : null,
                zoom: mapZoom,
                selectedParcelIds: Array.from(selectedParcelIds),
              }}
            />
            <ParcelMap
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
              onSelectionChange={setSelectedParcelIds}
              onViewStateChange={(center, zoom) => {
                setMapCenter(center);
                setMapZoom(zoom);
              }}
              selectedParcelIds={selectedParcelIds}
              trajectoryData={trajectoryData}
              searchSlot={
                <>
                  <h2 className="text-[10px] font-semibold uppercase tracking-wider text-map-text-muted mb-2">Parcel Search</h2>
                  <form
                    onSubmit={handleSearchSubmit}
                    className="flex flex-col gap-1.5"
                  >
                    <div className="relative">
                      <Input
                        value={searchText}
                        onChange={(event) => {
                          setSearchText(event.target.value);
                          setActiveSuggestionIndex(-1);
                        }}
                        onKeyDown={handleSearchKeyDown}
                        onBlur={() => {
                          setTimeout(() => {
                            setSuggestions([]);
                            setActiveSuggestionIndex(-1);
                          }, 120);
                        }}
                        placeholder="Search parcel address, d..."
                        className="h-8 text-xs bg-map-surface border-map-border text-map-text-primary placeholder:text-map-text-muted"
                      />
                      {(isSuggestLoading || suggestions.length > 0) && (
                        <div className="absolute z-20 mt-1 w-full rounded-md border border-map-border bg-map-surface shadow-lg">
                          {isSuggestLoading ? (
                            <div className="px-2 py-1.5 text-[10px] text-map-text-muted">
                              Matching addresses...
                            </div>
                          ) : (
                            <div className="max-h-44 overflow-y-auto">
                              {suggestions.map((suggestion, index) => (
                                <button
                                  key={`${suggestion.id}-${index}`}
                                  type="button"
                                  onMouseDown={(event) => event.preventDefault()}
                                  onClick={() => selectSuggestion(suggestion)}
                                  className={`w-full px-2 py-1.5 text-left text-[10px] transition-colors ${
                                    index === activeSuggestionIndex
                                      ? "bg-map-accent/25 text-map-text-primary"
                                      : "text-map-text-secondary hover:bg-map-surface-elevated hover:text-map-text-primary"
                                  }`}
                                >
                                  {suggestion.address}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <Button
                      type="submit"
                      size="sm"
                      disabled={!searchText.trim()}
                      onClick={submitSearch}
                      className="map-btn h-7 text-xs"
                    >
                      {isSearchLoading ? (
                        <span className="inline-flex items-center gap-2">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Searching
                        </span>
                      ) : (
                        <>
                          <Search className="mr-1.5 h-3 w-3" />
                          Search
                        </>
                      )}
                    </Button>
                  </form>
                  <p className="text-[10px] map-text-secondary mt-1.5">
                    {statusText}
                    {!polygon && debouncedSearch && !loadError
                      ? ` \u2022 ${searchMatchCount} matches \u2022 ${nearbyParcelCount} nearby (${SURROUNDING_PARCELS_RADIUS_MILES} mi)`
                      : ""}
                  </p>
                </>
              }
            />
          </>
        )}
      </div>
    </DashboardShell>
  );
}
