"use client";

import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
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
      const lat = Number(p.lat);
      const lng = Number(p.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return acc;

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

  useEffect(() => {
    async function loadBaseParcels() {
      try {
        const res = await fetch("/api/parcels?hasCoords=true");
        if (!res.ok) {
          setLoadError("Failed to load parcels. Please refresh and try again.");
          return;
        }
        const data = (await res.json()) as ParcelsApiResponse;
        setSource(data.source === "property-db-fallback" ? "property-db-fallback" : "org");
        if (data.error) {
          setLoadError(data.error);
        }
        setParcels(mapApiParcels(data));
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
          if (active) setSearchParcels([]);
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
        setSearchParcels(mapApiParcels(data));
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
  }, [debouncedSearch, searchSubmitId]);

  return (
    <DashboardShell>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Parcel Map</h1>
          <p className="text-sm text-muted-foreground">
            {loading
              ? "Loading..."
              : loadError
                ? loadError
                : hasNoSearchResults
                  ? "No parcels found for that search. Try a broader address, parcel number, or owner name."
                  : parcels.length === 0
                  ? "No parcels with coordinates are available yet. Enrich parcel coordinates to enable map search and boundaries."
                  : source === "property-db-fallback"
                    ? `${visibleParcels.length} of ${parcels.length} parcels (property database fallback)`
                    : `${visibleParcels.length} of ${parcels.length} parcels with coordinates`}
            {debouncedSearch
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
          <ParcelMap
            parcels={visibleParcels}
            height="calc(100vh - 14rem)"
            showTools
            onParcelClick={(id) => {
              const parcel = parcels.find((p) => p.id === id);
              if (parcel?.dealId) router.push(`/deals/${parcel.dealId}`);
            }}
          />
        )}
      </div>
    </DashboardShell>
  );
}
