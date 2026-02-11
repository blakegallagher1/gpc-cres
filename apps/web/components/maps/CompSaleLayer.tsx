"use client";

import { useState, useCallback, useEffect } from "react";
import { useMap, CircleMarker, Popup } from "react-leaflet";
import L from "leaflet";
import { Search, X, Loader2 } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CompSale {
  id: string;
  address: string;
  lat: number;
  lng: number;
  salePrice: number | null;
  saleDate: string | null;
  acreage: number | null;
  pricePerAcre: number | null;
  useType: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getRecencyColor(saleDate: string | null): string {
  if (!saleDate) return "#9ca3af"; // gray for unknown
  const months = monthsAgo(saleDate);
  if (months <= 6) return "#22c55e"; // green
  if (months <= 12) return "#eab308"; // yellow
  if (months <= 24) return "#f97316"; // orange
  return "#9ca3af"; // gray for older
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

function formatCurrency(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

// ---------------------------------------------------------------------------
// CompSaleLayer Component
// ---------------------------------------------------------------------------

interface CompSaleLayerProps {
  /** Auto-load comps around these parcels */
  centerLat?: number;
  centerLng?: number;
  /** Whether this layer is visible */
  visible: boolean;
}

export function CompSaleLayer({ centerLat, centerLng, visible }: CompSaleLayerProps) {
  const map = useMap();
  const [comps, setComps] = useState<CompSale[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchAddress, setSearchAddress] = useState("");

  const searchComps = useCallback(
    async (lat?: number, lng?: number, address?: string) => {
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

        // Fit bounds if we got results
        if (data.comps?.length > 0) {
          const bounds = L.latLngBounds(
            data.comps.map((c: CompSale) => [c.lat, c.lng])
          );
          map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    },
    [map]
  );

  // Auto-load when visible and center coords provided
  useEffect(() => {
    if (visible && centerLat && centerLng && !searched) {
      searchComps(centerLat, centerLng);
    }
  }, [visible, centerLat, centerLng, searched, searchComps]);

  if (!visible) return null;

  return (
    <>
      {/* Search panel */}
      <div className="leaflet-top leaflet-right" style={{ marginTop: 10, marginRight: 50 }}>
        <div className="leaflet-control rounded-lg bg-white/95 px-3 py-2 shadow-lg backdrop-blur-sm" style={{ minWidth: 220 }}>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 uppercase">
            <Search className="h-3 w-3" />
            Comparable Sales
          </div>
          <form
            className="mt-1.5 flex gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              if (searchAddress.trim()) {
                searchComps(undefined, undefined, searchAddress.trim());
              } else if (centerLat && centerLng) {
                searchComps(centerLat, centerLng);
              } else {
                // Use map center
                const c = map.getCenter();
                searchComps(c.lat, c.lng);
              }
            }}
          >
            <input
              type="text"
              value={searchAddress}
              onChange={(e) => setSearchAddress(e.target.value)}
              placeholder="Address or use map center"
              className="flex-1 rounded border px-2 py-1 text-xs"
              style={{ minWidth: 0 }}
            />
            <button
              type="submit"
              disabled={loading}
              className="rounded bg-blue-500 px-2 py-1 text-xs text-white hover:bg-blue-600 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Search"}
            </button>
          </form>
          {searched && (
            <div className="mt-1.5 flex items-center justify-between text-[10px] text-gray-500">
              <span>{comps.length} comp{comps.length !== 1 ? "s" : ""} found</span>
              <button
                onClick={() => {
                  setComps([]);
                  setSearched(false);
                  setSearchAddress("");
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
          {/* Legend */}
          <div className="mt-1.5 flex gap-2 text-[10px] text-gray-500">
            <span className="flex items-center gap-0.5">
              <span className="inline-block h-2 w-2 rounded-full bg-green-500" /> &lt;6mo
            </span>
            <span className="flex items-center gap-0.5">
              <span className="inline-block h-2 w-2 rounded-full bg-yellow-500" /> 6-12mo
            </span>
            <span className="flex items-center gap-0.5">
              <span className="inline-block h-2 w-2 rounded-full bg-orange-500" /> 12-24mo
            </span>
          </div>
        </div>
      </div>

      {/* Comp markers */}
      {comps.map((comp) => {
        const color = getRecencyColor(comp.saleDate);
        return (
          <CircleMarker
            key={comp.id}
            center={[comp.lat, comp.lng]}
            radius={9}
            pathOptions={{
              color,
              fillColor: color,
              fillOpacity: 0.7,
              weight: 2,
            }}
          >
            <Popup>
              <div style={{ fontSize: "13px", lineHeight: 1.5 }}>
                <div style={{ fontWeight: 600, marginBottom: 2 }}>{comp.address}</div>
                {comp.salePrice != null && (
                  <div style={{ fontSize: "14px", fontWeight: 700, color: "#1e40af" }}>
                    {formatCurrency(comp.salePrice)}
                  </div>
                )}
                {comp.pricePerAcre != null && (
                  <div style={{ fontSize: "11px" }}>
                    {formatCurrency(comp.pricePerAcre)} / acre
                  </div>
                )}
                {comp.acreage != null && (
                  <div style={{ fontSize: "11px" }}>
                    {Number(comp.acreage).toFixed(2)} acres
                  </div>
                )}
                {comp.saleDate && (
                  <div style={{ fontSize: "11px", color: "#6b7280" }}>
                    Sold: {new Date(comp.saleDate).toLocaleDateString()} ({getRecencyLabel(comp.saleDate)})
                  </div>
                )}
                {comp.useType && (
                  <div style={{ fontSize: "11px", color: "#6b7280" }}>
                    Use: {comp.useType}
                  </div>
                )}
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </>
  );
}
