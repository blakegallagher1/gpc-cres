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

const CARD_PANEL_SIZE = { width: 352, height: 284 };

interface ParcelDetailCardProps {
  parcel: MapParcel | null;
  point: [number, number] | null;
  containerSize: { width: number; height: number } | null;
  onClose: () => void;
  onAction: (action: MapPopupAction) => void;
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
  const [activeTab, setActiveTab] = useState<"details" | "comps" | "deals">("details");

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
        "pointer-events-auto absolute z-40 w-[22rem] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border border-map-border/80 bg-map-surface/95 shadow-2xl ring-1 ring-map-accent/15 backdrop-blur-md",
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
          <TabsList className="grid h-8 w-full grid-cols-3 bg-map-surface-elevated text-[10px]">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="comps">Comps</TabsTrigger>
            <TabsTrigger value="deals">Deals</TabsTrigger>
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
            <div className="rounded-xl border border-map-border bg-map-surface/60 p-3">
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

          <TabsContent value="deals" className="mt-3 space-y-3">
            <div className="rounded-xl border border-map-border bg-map-surface/60 p-3">
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
        </Tabs>
      </div>
    </motion.div>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-map-border bg-map-surface/60 px-2.5 py-2">
      <div className="text-[9px] uppercase tracking-[0.18em] text-map-text-muted">{label}</div>
      <div className="mt-1 truncate text-[10px] text-map-text-primary">{value}</div>
    </div>
  );
}
