"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ExternalLink, FileSearch, FolderPlus, MapPin, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { MapPopupAction } from "./MapPopupPresenter";
import type { MapParcel } from "./types";
import { clampFloatingPanelPosition } from "./floatingPanelPosition";
import { useParcelTruth, type ClientTruthView } from "@/hooks/useParcelTruth";
import { OwnerPortfolioCard } from "./OwnerPortfolioCard";

const CARD_PANEL_SIZE = { width: 352, height: 284 };

interface ParcelDetailCardProps {
  parcel: MapParcel | null;
  point: [number, number] | null;
  containerSize: { width: number; height: number } | null;
  onClose: () => void;
  onAction: (action: MapPopupAction) => void;
}

function computeAcquisitionSignal(parcel: { acreage?: number | null; floodZone?: string | null; currentZoning?: string | null }): { score: number; color: string; label: string } {
  let score = 50;
  if (parcel.acreage != null) {
    if (parcel.acreage >= 2 && parcel.acreage <= 20) score += 15;
    else if (parcel.acreage > 20) score += 5;
    else score -= 10;
  }
  const z = (parcel.currentZoning ?? "").toUpperCase();
  if (/^[IM]/.test(z)) score += 20;
  else if (/^C/.test(z)) score += 10;
  else if (/^A/.test(z)) score += 5;
  const f = (parcel.floodZone ?? "").toUpperCase();
  if (f.startsWith("A") || f.startsWith("V")) score -= 25;
  else if (f === "X" || f === "NONE" || !f) score += 5;
  score = Math.max(0, Math.min(100, score));
  const color = score >= 70 ? "#22c55e" : score >= 40 ? "#eab308" : "#ef4444";
  const label = score >= 70 ? "Strong" : score >= 40 ? "Review" : "Caution";
  return { score, color, label };
}

function getHighestBestUse(zoning: string | null | undefined): string {
  const z = (zoning ?? "").toUpperCase().trim();
  if (/^[IM]/.test(z)) return "Industrial";
  if (/^C/.test(z)) return "Commercial";
  if (/^R/.test(z)) return "Residential";
  if (/^A/.test(z)) return "Agricultural";
  if (z === "PUD") return "Planned Dev";
  if (!z) return "Unknown";
  return z;
}

function formatAcres(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return "Unknown";
  }
  return `${Number(value).toFixed(2)} acres`;
}

/**
 * Floating parcel detail card rendered at the clicked point.
 */
export function ParcelDetailCard({
  parcel,
  point,
  containerSize,
  onClose,
  onAction,
}: ParcelDetailCardProps) {
  const reduceMotion = useReducedMotion();
  const cardRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<"details" | "comps" | "owner" | "deals" | "intel">(
    "details",
  );

  useEffect(() => {
    if (!parcel) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, parcel]);

  useEffect(() => {
    if (!parcel) {
      setActiveTab("details");
    }
  }, [parcel]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!cardRef.current) {
        return;
      }
      const target = event.target as Node | null;
      if (target && !cardRef.current.contains(target)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  const coordinates = useMemo(() => {
    if (!parcel) return "";
    return `${parcel.lat.toFixed(6)},${parcel.lng.toFixed(6)}`;
  }, [parcel]);

  const { truth } = useParcelTruth(parcel ? { propertyDbId: parcel.propertyDbId ?? undefined, parcelId: parcel.id, address: parcel.address } : null);

  if (!parcel || !point) {
    return null;
  }

  const position = clampFloatingPanelPosition(
    { x: point[0], y: point[1] },
    containerSize,
    CARD_PANEL_SIZE,
    14,
  );

  const streetViewUrl = `https://www.google.com/maps/@${coordinates},3a,75y,0h,90t/data=!3m6!1e1`;
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${coordinates}`;

  return (
    <motion.div
      ref={cardRef}
      role="dialog"
      aria-label={`${parcel.address} details`}
      initial={reduceMotion ? false : { opacity: 0, scale: 0.98, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98, y: 6 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] as const }}
      className={cn(
        "pointer-events-auto absolute z-40 w-[22rem] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border border-map-border bg-map-panel shadow-[0_26px_60px_-34px_rgba(15,23,42,0.92)] ring-1 ring-map-border",
      )}
      style={{
        left: position.left,
        top: position.top,
      }}
    >
      <div className="flex items-start justify-between gap-3 border-b border-map-border px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-map-accent" />
            <h3 className="truncate text-sm font-semibold text-map-text-primary">{parcel.address}</h3>
          </div>
          <p className="mt-0.5 text-[11px] text-map-text-muted">{parcel.propertyDbId ?? parcel.id}</p>
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="Close parcel card"
          onClick={onClose}
          className="h-7 w-7 shrink-0 text-map-text-muted hover:bg-map-surface hover:text-map-text-primary"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="px-3 py-3">
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)}>
          <TabsList className="grid h-8 w-full grid-cols-5 bg-map-surface text-[10px]">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="comps">Comps</TabsTrigger>
            <TabsTrigger value="owner">Owner</TabsTrigger>
            <TabsTrigger value="deals">Deals</TabsTrigger>
            <TabsTrigger value="intel">Intel</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="mt-3 space-y-3">
            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <DetailField label="Owner" value={parcel.owner ?? "Unknown"} />
              <DetailField label="Acreage" value={formatAcres(parcel.acreage)} />
              <DetailField label="Zoning" value={parcel.currentZoning ?? "Unknown"} />
              <DetailField label="Flood" value={parcel.floodZone ?? "None"} />
              <DetailField label="Coords" value={coordinates} />
              <DetailField label="Lookup" value={parcel.propertyDbId ?? parcel.id} />
            </div>

            {(() => {
              const signal = computeAcquisitionSignal(parcel);
              const hbu = getHighestBestUse(parcel.currentZoning);
              return (
                <div className="rounded-xl border border-map-border bg-map-surface p-2.5">
                  <div className="mb-2 text-[9px] uppercase tracking-[0.18em] text-map-text-muted">Quick Economics</div>
                  <div className="flex flex-wrap items-center gap-2 text-[10px]">
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-medium text-white"
                      style={{ backgroundColor: signal.color }}
                    >
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-white/40" />
                      {signal.label} ({signal.score})
                    </span>
                    <span className="text-map-text-secondary">HBU: {hbu}</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-map-text-muted">
                    {parcel.owner ? <span>Owner: <span className="text-map-text-primary">{parcel.owner}</span></span> : null}
                    {parcel.dealId ? (
                      <span className="inline-flex items-center gap-1 text-map-accent">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-map-accent" />
                        Has Deal
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })()}

            <div className="flex flex-wrap gap-2">
              <a
                href={googleMapsUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-map-border bg-map-surface px-2.5 py-1.5 text-[10px] text-map-text-secondary hover:bg-map-surface-elevated hover:text-map-text-primary"
              >
                <ExternalLink className="h-3 w-3" />
                Google Maps
              </a>
              <a
                href={streetViewUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-map-border bg-map-surface px-2.5 py-1.5 text-[10px] text-map-text-secondary hover:bg-map-surface-elevated hover:text-map-text-primary"
              >
                <ExternalLink className="h-3 w-3" />
                Street View
              </a>
            </div>
          </TabsContent>

          <TabsContent value="comps" className="mt-3 space-y-3">
            <div className="rounded-xl border border-map-border bg-map-surface p-3">
              <div className="flex items-center gap-2 text-[11px] font-medium text-map-text-primary">
                <FileSearch className="h-3.5 w-3.5 text-map-accent" />
                Comparable search
              </div>
              <p className="mt-1 text-[10px] leading-4 text-map-text-muted">
                Centered on this parcel for a quick read on nearby transactions and pricing.
              </p>
              <Button
                type="button"
                className="mt-3 h-8 bg-map-accent px-3 text-[10px] font-medium text-white hover:bg-map-accent/90"
                onClick={() =>
                  onAction({
                    type: "open_comps",
                    parcelId: parcel.id,
                    lat: parcel.lat,
                    lng: parcel.lng,
                    address: parcel.address,
                  })
                }
              >
                View Comps
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="owner" className="mt-3 space-y-3">
            <OwnerPortfolioCard
              ownerName={parcel.owner ?? null}
              currentParcelId={parcel.propertyDbId ?? parcel.id}
            />
          </TabsContent>

          <TabsContent value="deals" className="mt-3 space-y-3">
            <div className="rounded-xl border border-map-border bg-map-surface p-3">
              <div className="flex items-center gap-2 text-[11px] font-medium text-map-text-primary">
                <FolderPlus className="h-3.5 w-3.5 text-map-accent" />
                Deal workflow
              </div>
              <p className="mt-1 text-[10px] leading-4 text-map-text-muted">
                Push this parcel into the deal pipeline or mark it for screening.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  className="h-8 bg-map-accent px-3 text-[10px] font-medium text-white hover:bg-map-accent/90"
                  onClick={() =>
                    onAction({
                      type: "create_deal",
                      parcelId: parcel.id,
                    })
                  }
                >
                  Create Deal
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 border-map-border bg-map-surface px-3 text-[10px] text-map-text-primary hover:bg-map-surface-elevated"
                  onClick={() =>
                    onAction({
                      type: "screen_parcel",
                      parcelId: parcel.id,
                    })
                  }
                >
                  Screen Parcel
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="intel" className="mt-3 space-y-3">
            {truth ? (
              <SavedIntelSection truth={truth} />
            ) : (
              <div className="rounded-xl border border-map-border bg-map-surface p-3 text-[10px] text-map-text-muted">
                No saved intel for this parcel yet.
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </motion.div>
  );
}

function SavedIntelSection({ truth }: { truth: ClientTruthView }) {
  const COMP_FIELDS: { key: string; label: string; format?: (v: unknown) => string }[] = [
    { key: "comp.sale_price", label: "Sale Price", format: (v) => v != null ? `$${Number(v).toLocaleString()}` : "" },
    { key: "comp.sale_date", label: "Sale Date" },
    { key: "comp.buyer", label: "Buyer" },
    { key: "comp.seller", label: "Seller" },
    { key: "comp.cap_rate", label: "Cap Rate", format: (v) => v != null ? `${Number(v).toFixed(2)}%` : "" },
    { key: "comp.noi", label: "NOI", format: (v) => v != null ? `$${Number(v).toLocaleString()}` : "" },
    { key: "comp.price_per_acre", label: "$/Acre", format: (v) => v != null ? `$${Number(v).toLocaleString()}` : "" },
    { key: "comp.price_per_sf", label: "$/SF", format: (v) => v != null ? `$${Number(v).toFixed(2)}` : "" },
  ];

  const rows = COMP_FIELDS.flatMap(({ key, label, format }) => {
    const entry = truth.currentValues[key];
    if (!entry) return [];
    const rawVal = entry.value;
    const displayVal = format ? format(rawVal) : String(rawVal ?? "");
    if (!displayVal) return [];
    const hasConflict = truth.openConflicts.some((c) => c.key === key);
    const wasCorrected = Boolean(entry.correctedBy);
    return [{ key, label, displayVal, hasConflict, wasCorrected }];
  });

  if (rows.length === 0) return null;

  return (
    <div className="rounded-xl border border-map-border bg-map-surface p-2.5">
      <div className="mb-2 text-[9px] uppercase tracking-[0.18em] text-map-text-muted">Saved Intel</div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[10px]">
        {rows.map(({ key, label, displayVal, hasConflict, wasCorrected }) => (
          <div key={key} className="flex flex-col gap-0.5">
            <span className="text-map-text-muted">{label}</span>
            <span className="flex items-center gap-1 font-medium text-map-text-primary">
              {displayVal}
              {hasConflict && (
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400" title="Conflicting values" />
              )}
              {wasCorrected && (
                <span className="text-[9px] text-map-text-muted">(corrected)</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-map-border bg-map-surface px-2.5 py-2">
      <div className="text-[9px] uppercase tracking-[0.18em] text-map-text-muted">{label}</div>
      <div className="mt-1 truncate text-[10px] text-map-text-primary">{value}</div>
    </div>
  );
}
