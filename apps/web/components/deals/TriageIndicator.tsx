"use client";

import { cn } from "@/lib/utils";

type TriageTier = "GREEN" | "YELLOW" | "RED" | "GRAY";

const tierColors: Record<TriageTier, string> = {
  GREEN: "bg-green-500",
  YELLOW: "bg-yellow-400",
  RED: "bg-red-500",
  GRAY: "bg-gray-400",
};

const tierLabels: Record<TriageTier, string> = {
  GREEN: "Go",
  YELLOW: "Caution",
  RED: "No-Go",
  GRAY: "Pending",
};

interface TriageIndicatorProps {
  tier?: TriageTier | string | null;
  showLabel?: boolean;
  className?: string;
}

export function TriageIndicator({ tier, showLabel = false, className }: TriageIndicatorProps) {
  const t = (tier as TriageTier) ?? "GRAY";
  const color = tierColors[t] ?? tierColors.GRAY;
  const label = tierLabels[t] ?? "Unknown";

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className={cn("h-2.5 w-2.5 rounded-full", color)} />
      {showLabel && <span className="text-xs text-muted-foreground">{label}</span>}
    </span>
  );
}
