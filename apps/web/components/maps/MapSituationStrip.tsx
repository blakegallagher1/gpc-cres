"use client";

import { motion } from "framer-motion";
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

function Pill({ children, accent, index }: { children: React.ReactNode; accent?: boolean; index?: number }) {
  return (
    <motion.span
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: (index ?? 0) * 0.05 }}
      className={cn(
        "pointer-events-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium tracking-wide backdrop-blur-md",
        accent
          ? "bg-map-accent/20 text-map-accent ring-1 ring-map-accent/30"
          : "bg-map-surface/70 text-map-text-secondary ring-1 ring-map-border/50",
      )}
    >
      {children}
    </motion.span>
  );
}

export function MapSituationStrip({
  selectedCount,
  trackedCount,
  openTaskCount,
  analysisCount,
  overlayCount,
  drawMode,
  dataFreshnessLabel,
  latencyLabel,
}: MapSituationStripProps) {
  const pills: { key: string; label: string; accent?: boolean }[] = [];

  if (selectedCount > 0) pills.push({ key: "sel", label: `${selectedCount} selected`, accent: true });
  if (trackedCount > 0) pills.push({ key: "trk", label: `${trackedCount} tracked` });
  if (openTaskCount > 0) pills.push({ key: "tsk", label: `${openTaskCount} tasks` });
  if (analysisCount > 0) pills.push({ key: "ana", label: `${analysisCount} analyses` });
  if (overlayCount > 0) pills.push({ key: "ovl", label: `${overlayCount} overlays` });
  if (drawMode !== "idle") pills.push({ key: "drw", label: "Drawing", accent: true });

  // Always show system status as a single subtle pill
  pills.push({ key: "sys", label: `${dataFreshnessLabel} · ${latencyLabel}` });

  return (
    <div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-wrap items-center gap-1.5">
      {pills.map((p, i) => (
        <Pill key={p.key} accent={p.accent} index={i}>
          {p.label}
        </Pill>
      ))}
    </div>
  );
}
