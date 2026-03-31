"use client";

import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { ParcelHoverTarget } from "./mapLibreAdapter";
import { clampFloatingPanelPosition } from "./floatingPanelPosition";

const TOOLTIP_PANEL_SIZE = { width: 224, height: 88 };

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
        "pointer-events-none absolute z-50 w-56 rounded-lg border border-slate-800/90 bg-slate-950/95 px-3 py-2 text-[10px] leading-4 text-white shadow-xl backdrop-blur-md",
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
    </motion.div>
  );
}
