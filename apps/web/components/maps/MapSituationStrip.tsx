"use client";

import { cn } from "@/lib/utils";

export interface MapSituationStripProps {
  selectedCount: number;
  trackedCount: number;
  openTaskCount: number;
  analysisCount: number;
  overlayCount: number;
  drawMode: "idle" | "drawing" | "polygon";
  dataFreshnessLabel: string;
  latencyLabel: string;
}

function Pill({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <span
      className={cn(
        "pointer-events-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium tracking-wide backdrop-blur-md",
        accent
          ? "bg-map-accent/20 text-map-accent ring-1 ring-map-accent/30"
          : "bg-map-surface/70 text-map-text-secondary ring-1 ring-map-border/50",
      )}
    >
      {children}
    </span>
  );
}

export function MapSituationStrip({
  selectedCount,
  trackedCount,
  openTaskCount,
  overlayCount,
  drawMode,
  dataFreshnessLabel,
  latencyLabel,
}: MapSituationStripProps) {
  const pills: { key: string; label: string; accent?: boolean }[] = [];

  if (selectedCount > 0) pills.push({ key: "sel", label: `${selectedCount} selected`, accent: true });
  if (trackedCount > 0) pills.push({ key: "trk", label: `${trackedCount} tracked` });
  if (openTaskCount > 0) pills.push({ key: "tsk", label: `${openTaskCount} tasks` });
  if (overlayCount > 0) pills.push({ key: "ovl", label: `${overlayCount} overlays` });
  if (drawMode !== "idle") pills.push({ key: "drw", label: "Drawing", accent: true });

  // Always show system status as a single subtle pill
  pills.push({ key: "sys", label: `${dataFreshnessLabel} · ${latencyLabel}` });

  return (
    <div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-wrap items-center gap-1.5">
      {pills.map((p) => (
        <Pill key={p.key} accent={p.accent}>
          {p.label}
        </Pill>
      ))}
    </div>
  );
}
