"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { Building2, Loader2, MapPin } from "lucide-react";

interface OwnerPortfolioParcel {
  parcelId: string;
  address: string | null;
  acreage: number | null;
  lat: number | null;
  lng: number | null;
  assessedValue: number | null;
}

interface OwnerPortfolio {
  normalizedOwner: string;
  canonicalOwner: string;
  variantCount: number;
  parcelCount: number;
  totalAcreage: number;
  totalAssessedValue: number;
  centroid: { lat: number; lng: number } | null;
  parcels: OwnerPortfolioParcel[];
}

interface OwnerPortfolioCardProps {
  ownerName: string | null | undefined;
  currentParcelId?: string;
  onParcelClick?: (parcelId: string) => void;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
};

function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "—";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return value.toFixed(0);
}

export function OwnerPortfolioCard({
  ownerName,
  currentParcelId,
  onParcelClick,
}: OwnerPortfolioCardProps) {
  const shouldFetch = typeof ownerName === "string" && ownerName.trim().length > 0;
  const { data, error, isLoading } = useSWR<{ portfolio: OwnerPortfolio | null }>(
    shouldFetch
      ? `/api/map/ownership-clusters/portfolio?ownerName=${encodeURIComponent(ownerName!)}`
      : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 },
  );

  const portfolio = data?.portfolio ?? null;
  const otherParcels = useMemo(() => {
    if (!portfolio) return [];
    return portfolio.parcels.filter((p) => p.parcelId !== currentParcelId);
  }, [portfolio, currentParcelId]);

  if (!shouldFetch) {
    return (
      <p className="text-[10px] text-map-text-muted">
        Owner unknown — portfolio lookup unavailable.
      </p>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-1.5 text-[10px] text-map-text-muted">
        <Loader2 className="h-3 w-3 animate-spin" /> Checking owner portfolio…
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-[10px] text-destructive">
        Failed to load owner portfolio.
      </p>
    );
  }

  if (!portfolio || portfolio.parcelCount <= 1) {
    return (
      <div className="rounded-lg border border-map-border bg-map-surface/60 p-2 text-[10px] text-map-text-muted">
        No additional parcels detected for this owner in the property DB.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="rounded-xl border border-map-border bg-map-surface/60 p-2.5">
        <div className="mb-1 flex items-center gap-1.5 text-[9px] uppercase tracking-[0.18em] text-map-text-muted">
          <Building2 className="h-3 w-3" />
          LLC portfolio
        </div>
        <p className="text-[11px] font-medium text-map-text-primary">
          {portfolio.canonicalOwner}
        </p>
        {portfolio.variantCount > 1 && (
          <p className="text-[9px] text-map-text-muted">
            {portfolio.variantCount} name variants aggregated
          </p>
        )}
        <div className="mt-2 grid grid-cols-3 gap-2 text-[10px]">
          <div>
            <div className="text-map-text-muted">Parcels</div>
            <div className="font-mono tabular-nums text-map-text-primary">
              {portfolio.parcelCount}
            </div>
          </div>
          <div>
            <div className="text-map-text-muted">Total acres</div>
            <div className="font-mono tabular-nums text-map-text-primary">
              {portfolio.totalAcreage.toFixed(1)}
            </div>
          </div>
          <div>
            <div className="text-map-text-muted">Assessed</div>
            <div className="font-mono tabular-nums text-map-text-primary">
              ${formatCompactNumber(portfolio.totalAssessedValue)}
            </div>
          </div>
        </div>
      </div>

      {otherParcels.length > 0 && (
        <div className="rounded-xl border border-map-border bg-map-surface/60 p-2.5">
          <div className="mb-1.5 text-[9px] uppercase tracking-[0.18em] text-map-text-muted">
            Other parcels ({otherParcels.length})
          </div>
          <div className="space-y-1 max-h-[240px] overflow-y-auto">
            {otherParcels.slice(0, 25).map((p) => (
              <button
                key={p.parcelId}
                type="button"
                onClick={() => onParcelClick?.(p.parcelId)}
                className="flex w-full items-start gap-1.5 rounded border border-transparent px-1.5 py-1 text-left text-[10px] hover:border-map-border hover:bg-map-surface-elevated"
              >
                <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-map-text-muted" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono tabular-nums text-map-text-primary">
                    {p.address ?? p.parcelId}
                  </span>
                  <span className="text-[9px] text-map-text-muted">
                    {p.acreage ? `${p.acreage.toFixed(2)} ac` : "—"}
                    {p.assessedValue
                      ? ` · $${formatCompactNumber(p.assessedValue)}`
                      : ""}
                  </span>
                </span>
              </button>
            ))}
            {otherParcels.length > 25 && (
              <p className="mt-1 text-center text-[9px] text-map-text-muted">
                +{otherParcels.length - 25} more not shown
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default OwnerPortfolioCard;
