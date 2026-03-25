"use client";

import { Badge } from "@/components/ui/badge";

export interface MapSituationStripProps {
  selectedCount: number;
  overlayCount: number;
  drawMode: "idle" | "drawing" | "polygon";
  dataFreshnessLabel: string;
  latencyLabel: string;
}

export function MapSituationStrip({
  selectedCount,
  overlayCount,
  drawMode,
  dataFreshnessLabel,
  latencyLabel,
}: MapSituationStripProps) {
  return (
    <div className="border-b border-map-border bg-map-surface-overlay/95 px-3 py-2 backdrop-blur-sm">
      <div className="flex flex-wrap items-center gap-2 text-[10px] text-map-text-secondary">
        <Badge variant="outline" className="px-2 py-0.5 text-[9px]">
          {selectedCount} selected
        </Badge>
        <Badge variant="outline" className="px-2 py-0.5 text-[9px]">
          {overlayCount} overlays active
        </Badge>
        <Badge variant="outline" className="px-2 py-0.5 text-[9px]">
          Draw: {drawMode}
        </Badge>
        <Badge variant="secondary" className="px-2 py-0.5 text-[9px]">
          Freshness: {dataFreshnessLabel}
        </Badge>
        <Badge variant="secondary" className="px-2 py-0.5 text-[9px]">
          Latency: {latencyLabel}
        </Badge>
      </div>
    </div>
  );
}
