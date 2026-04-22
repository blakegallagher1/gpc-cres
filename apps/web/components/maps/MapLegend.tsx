"use client";

import React from "react";
import { type ParcelColorMode, getParcelLegendItems } from "./parcelColorExpressions";

export interface MapLegendProps {
  showParcelBoundaries: boolean;
  showZoning: boolean;
  showFlood: boolean;
  showSoils: boolean;
  showWetlands: boolean;
  showEpa: boolean;
  showMobileHomePark: boolean;
  parcelColorMode?: ParcelColorMode;
  onToggleParcelBoundaries?: () => void;
  onToggleZoning?: () => void;
  onToggleFlood?: () => void;
  onToggleSoils?: () => void;
  onToggleWetlands?: () => void;
  onToggleEpa?: () => void;
  onToggleMobileHomePark?: () => void;
}

/**
 * Compact overlay legend positioned bottom-right of the map canvas.
 * Shows color swatches + labels for each active layer.
 */
export function MapLegend({
  showParcelBoundaries,
  showZoning,
  showFlood,
  showSoils,
  showWetlands,
  showEpa,
  showMobileHomePark,
  parcelColorMode,
  onToggleParcelBoundaries,
  onToggleZoning,
  onToggleFlood,
  onToggleSoils,
  onToggleWetlands,
  onToggleEpa,
  onToggleMobileHomePark,
}: MapLegendProps): React.ReactNode {
  const items: Array<{ label: string; color: string; onToggle?: () => void }> = [
    ...(showParcelBoundaries
      ? getParcelLegendItems(parcelColorMode ?? "zoning").map((item) => ({
        ...item,
        onToggle: onToggleParcelBoundaries,
      }))
      : []),
    showZoning && {
      label: "Zoning",
      color: "#9333ea", // purple (M1/industrial example)
      onToggle: onToggleZoning,
    },
    showFlood && {
      label: "Flood zones",
      color: "#ef4444", // red (Zone A/AE worst case)
      onToggle: onToggleFlood,
    },
    showSoils && {
      label: "Soils",
      color: "#a16207", // brown (soil layer)
      onToggle: onToggleSoils,
    },
    showWetlands && {
      label: "Wetlands",
      color: "#0891b2", // teal (water-based)
      onToggle: onToggleWetlands,
    },
    showEpa && {
      label: "EPA facilities",
      color: "#dc2626", // red (contamination)
      onToggle: onToggleEpa,
    },
    showMobileHomePark && {
      label: "Mobile home parks",
      color: "#8b5cf6", // purple (MHP marker)
      onToggle: onToggleMobileHomePark,
    },
  ].filter(Boolean) as Array<{ label: string; color: string; onToggle?: () => void }>;

  if (items.length === 0) return null;

  return (
    <div className="absolute bottom-10 right-3 z-10 rounded-xl border border-map-border bg-[#1a1d27] px-2.5 py-2">
      <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.18em] text-map-text-muted">
        Active layers
      </p>
      {items.map((item) => (
        item.onToggle ? (
          <button
            key={item.label}
            type="button"
            onClick={item.onToggle}
            className="mb-1 flex w-full items-center gap-2 rounded-md px-1 py-1 text-left text-[10px] font-mono text-white transition-colors hover:bg-white/10 last:mb-0"
            title={`Hide ${item.label}`}
            aria-label={`Hide ${item.label}`}
          >
            <div
              className="h-2 w-2 flex-shrink-0 rounded-sm"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-map-text">{item.label}</span>
          </button>
        ) : (
          <div key={item.label} className="mb-1 flex items-center gap-2 text-[10px] font-mono text-white last:mb-0">
            <div
              className="h-2 w-2 flex-shrink-0 rounded-sm"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-map-text">{item.label}</span>
          </div>
        )
      ))}
    </div>
  );
}
