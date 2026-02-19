"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
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
  deal?: { id: string; name: string; sku: string; status: string } | null;
}

interface ParcelsApiResponse {
  parcels: ApiParcel[];
  source?: "org" | "property-db-fallback";
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

  const handleSearchSubmit = (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const nextSearch = searchText.trim();
    setDebouncedSearch(nextSearch);
    setSearchSubmitId((value) => value + 1);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchText.trim());
    }, 250);
    return () => clearTimeout(timer);
  }, [searchText]);

  const mapApiParcels = (data: ParcelsApiResponse): MapParcel[] =>
    (data.parcels as ApiParcel[])
      .filter((p) => p.lat != null && p.lng != null)
      .map((p) => ({
        id: p.id,
        address: p.address,
        lat: Number(p.lat),
        lng: Number(p.lng),
        dealId: p.deal?.id,
        dealName: p.deal?.name,
        dealStatus: p.deal?.status,
        floodZone: p.floodZone ?? null,
        currentZoning: p.currentZoning ?? null,
        propertyDbId: p.propertyDbId ?? null,
        acreage: p.acreage != null ? Number(p.acreage) : null,
      }));

  const baseVisibleParcels = useMemo(
    () => (debouncedSearch ? searchParcels ?? [] : parcels),
    [debouncedSearch, searchParcels, parcels],
  );

  const visibleParcels = useMemo(() => {
    const query = debouncedSearch.toLowerCase();
    if (!query) return baseVisibleParcels;

    const matching = baseVisibleParcels.filter((parcel) => {
      const address = parcel.address.toLowerCase();
      const dealName = parcel.dealName?.toLowerCase() ?? "";
      const zoning = parcel.currentZoning?.toLowerCase() ?? "";
      return (
        address.includes(query) ||
        dealName.includes(query) ||
        zoning.includes(query)
      );
    });

    if (matching.length === 0) return [];

    const anchor =
      matching.find((parcel) => parcel.address.toLowerCase().startsWith(query)) ??
      matching[0];

    const surrounding = parcels.filter(
      (parcel) =>
        distanceMiles(anchor, parcel) <= SURROUNDING_PARCELS_RADIUS_MILES,
    );

    const merged = new Map<string, MapParcel>();
    for (const parcel of surrounding) merged.set(parcel.id, parcel);
    for (const parcel of matching) merged.set(parcel.id, parcel);

    return Array.from(merged.values());
  }, [baseVisibleParcels, debouncedSearch, parcels]);

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
      if (!debouncedSearch) {
        setSearchParcels(null);
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
        setSource(data.source === "property-db-fallback" ? "property-db-fallback" : "org");
        setSearchParcels(mapApiParcels(data));
      } catch {
        if (active) setSearchParcels([]);
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
              placeholder="Search parcel address, deal, or zoning"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleSearchSubmit();
                }
              }}
            />
            <Button
              type="submit"
              size="sm"
            >
              Search
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
