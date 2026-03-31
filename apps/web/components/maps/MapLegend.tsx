"use client";

import React from "react";

export interface MapLegendProps {
  showParcelBoundaries: boolean;
  showZoning: boolean;
  showFlood: boolean;
  showSoils: boolean;
  showWetlands: boolean;
  showEpa: boolean;
  showMobileHomePark: boolean;
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
}: MapLegendProps): React.ReactNode {
  const items: Array<{ label: string; color: string }> = [
    showParcelBoundaries && {
      label: "Parcels",
      color: "#fbbf24", // yellow boundary
    },
    showZoning && {
      label: "Zoning",
      color: "#9333ea", // purple (M1/industrial example)
    },
    showFlood && {
      label: "Flood zones",
      color: "#ef4444", // red (Zone A/AE worst case)
    },
    showSoils && {
      label: "Soils",
      color: "#a16207", // brown (soil layer)
    },
    showWetlands && {
      label: "Wetlands",
      color: "#0891b2", // teal (water-based)
    },
    showEpa && {
      label: "EPA facilities",
      color: "#dc2626", // red (contamination)
    },
    showMobileHomePark && {
      label: "Mobile home parks",
      color: "#8b5cf6", // purple (MHP marker)
    },
  ].filter(Boolean) as Array<{ label: string; color: string }>;

  if (items.length === 0) return null;

  return (
    <div className="absolute bottom-10 right-3 z-10 bg-black/70 backdrop-blur-sm rounded-md px-2 py-1.5">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5 text-[10px] font-mono text-white mb-0.5 last:mb-0">
          <div
            className="w-2 h-2 rounded-sm flex-shrink-0"
            style={{ backgroundColor: item.color }}
          />
          <span className="text-map-text">{item.label}</span>
        </div>
      ))}
    </div>
  );
}
