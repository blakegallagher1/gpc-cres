"use client";

import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { ParcelHoverTarget } from "./mapLibreAdapter";
import { clampFloatingPanelPosition } from "./floatingPanelPosition";

const TOOLTIP_PANEL_SIZE = { width: 224, height: 120 };

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

function formatPricePerAcre(acreage: number | null | undefined): string {
  if (acreage == null || !Number.isFinite(acreage) || acreage <= 0) return "\u2014";
  return `${acreage.toFixed(2)} ac`;
}

interface ParcelHoverTooltipProps {
  parcel: ParcelHoverTarget | null;
  point: [number, number] | null;
  containerSize: { width: number; height: number } | null;
}

/**
 * Lightweight hover tooltip for parcels on the map.
 */
export function ParcelHoverTooltip({ parcel, point, containerSize }: ParcelHoverTooltipProps) {
  const reduceMotion = useReducedMotion();

  if (!parcel || !point) {
    return null;
  }

  const position = clampFloatingPanelPosition(
    { x: point[0], y: point[1] },
    containerSize,
    TOOLTIP_PANEL_SIZE,
    12,
  );

  return (
    <motion.div
      role="tooltip"
      initial={reduceMotion ? false : { opacity: 0, scale: 0.96, y: 4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98, y: 2 }}
      transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] as const }}
      className={cn(
        "pointer-events-none absolute z-50 w-56 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-[10px] leading-4 text-white shadow-xl",
      )}
      style={{
        left: position.left,
        top: position.top,
      }}
    >
      <div className="truncate font-medium">{parcel.address}</div>
      <div className="mt-1 flex items-center justify-between gap-2 text-[9px] uppercase tracking-[0.18em] text-slate-300">
        <span>{parcel.propertyDbId ?? parcel.id}</span>
        {parcel.owner ? <span className="truncate text-right normal-case tracking-normal">{parcel.owner}</span> : null}
      </div>
      {(() => {
        const signal = computeAcquisitionSignal(parcel);
        const hbu = getHighestBestUse(parcel.currentZoning);
        return (
          <>
            <div className="my-1.5 border-t border-slate-700/60" />
            <div className="flex items-center justify-between gap-2 text-[9px] text-slate-300">
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: signal.color }}
                />
                <span className="font-medium" style={{ color: signal.color }}>{signal.label}</span>
              </span>
              <span className="text-slate-400">{formatPricePerAcre(parcel.acreage)}</span>
              <span className="truncate text-slate-400">{hbu}</span>
            </div>
          </>
        );
      })()}
    </motion.div>
  );
}
