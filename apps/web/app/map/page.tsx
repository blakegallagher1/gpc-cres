"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import type { MapParcel } from "@/components/maps/ParcelMap";
import { Input } from "@/components/ui/input";

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

export default function MapPage() {
  const router = useRouter();
  const [parcels, setParcels] = useState<MapParcel[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);

  const visibleParcels = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) return parcels;
    return parcels.filter((parcel) => {
      const address = parcel.address.toLowerCase();
      const dealName = parcel.dealName?.toLowerCase() ?? "";
      const zoning = parcel.currentZoning?.toLowerCase() ?? "";
      return (
        address.includes(query) ||
        dealName.includes(query) ||
        zoning.includes(query)
      );
    });
  }, [parcels, searchText]);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/parcels?hasCoords=true");
        if (!res.ok) {
          setLoadError("Failed to load parcels. Please refresh and try again.");
          return;
        }
        const data = await res.json();
        const mapped: MapParcel[] = (data.parcels as ApiParcel[])
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
        setParcels(mapped);
      } catch {
        setLoadError("Failed to load parcels. Please refresh and try again.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

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
                  : `${visibleParcels.length} of ${parcels.length} parcels with coordinates`}
          </p>
        </div>
        <div className="max-w-md">
          <Input
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Search parcel address, deal, or zoning"
          />
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
