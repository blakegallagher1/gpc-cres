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
import { useRouter } from "next/navigation";
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
  source?: "org" | "property-db-fallback";
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

const SURROUNDING_PARCELS_RADIUS_MILES = 1.25;

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

export default function MapPage() {
  const router = useRouter();
  const [parcels, setParcels] = useState<MapParcel[]>([]);
  const [searchParcels, setSearchParcels] = useState<MapParcel[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [searchSubmitId, setSearchSubmitId] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [source, setSource] = useState<"org" | "property-db-fallback">("org");
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [polygon, setPolygon] = useState<number[][][] | null>(null);
  const [polygonParcels, setPolygonParcels] = useState<MapParcel[] | null>(null);
  const [polygonError, setPolygonError] = useState<string | null>(null);
  const [isPolygonLoading, setIsPolygonLoading] = useState(false);
  const [trajectoryData, setTrajectoryData] = useState<{
  type: "FeatureCollection";
  features: unknown[];
} | null>(null);
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
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    if (!searchText.trim()) return;
    event.preventDefault();
    handleSearchSubmit();
  };

  const submitSearch = () => {
    handleSearchSubmit();
  };

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
        setSource(data.source === "property-db-fallback" ? "property-db-fallback" : "org");
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
        setSource(data.source === "property-db-fallback" ? "property-db-fallback" : "org");
        const mapped = mapApiParcels(data);
        if (mapped.length === 0 && data.parcels.length > 0) {
          setLoadError(
            "Search returned parcels without usable coordinates (lat/lng).",
          );
        }
        setSearchParcels(mapped);
      } catch {
        if (active) setSearchParcels([]);
        setLoadError("Search failed. Please try again.");
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
  }, [debouncedSearch, searchSubmitId, polygon]);

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
    if (source === "property-db-fallback") {
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
    <DashboardShell>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Parcel Map</h1>
          <p className="text-sm text-muted-foreground">
            {statusText}
            {!polygon && debouncedSearch
              ? ` • showing matches + nearby parcels (${SURROUNDING_PARCELS_RADIUS_MILES} mi)`
              : ""}
          </p>
        </div>
        <div className="max-w-md">
          <form
            onSubmit={handleSearchSubmit}
            className="flex items-center gap-2"
          >
            <Input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search parcel address, deal, or zoning"
            />
            <Button
              type="submit"
              size="sm"
              disabled={!searchText.trim()}
              onClick={submitSearch}
            >
              {isSearchLoading ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Searching
                </span>
              ) : (
                <>
                  <Search className="mr-2 h-3.5 w-3.5" />
                  Search
                </>
              )}
            </Button>
          </form>
        </div>
        {!loading && (
          <div className="relative">
            <MapChatPanel onGeoJsonReceived={setTrajectoryData} />
            <ParcelMap
            parcels={activeParcels}
            height="calc(100vh - 14rem)"
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
            trajectoryData={trajectoryData}
          />
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
