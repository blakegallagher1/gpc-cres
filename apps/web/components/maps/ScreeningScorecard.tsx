"use client";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useParcelScreening } from "@/hooks/useParcelScreening";
import { cn } from "@/lib/utils";
import { Droplets, Mountain, TreePine, Factory } from "lucide-react";

type Props = { parcelId: string | null; className?: string };

type ScreeningDimension = {
  key: string;
  label: string;
  status: "pass" | "flag" | "fail" | "unknown";
  detail: string;
  weight: number;
};

function deriveWaterfallDimensions(screening: {
  in_sfha: boolean;
  flood_zone_count: number;
  has_hydric: boolean;
  soil_unit_count: number;
  has_wetlands: boolean;
  wetland_count: number;
  has_nearby_epa_facilities: boolean;
  epa_facility_count: number;
  has_environmental_constraints: boolean;
}): ScreeningDimension[] {
  return [
    {
      key: "flood",
      label: "Flood",
      status: screening.in_sfha ? "fail" : screening.flood_zone_count > 0 ? "flag" : "pass",
      detail: screening.in_sfha
        ? `SFHA \u2014 ${screening.flood_zone_count} zone${screening.flood_zone_count !== 1 ? "s" : ""}`
        : screening.flood_zone_count > 0
          ? `${screening.flood_zone_count} zone${screening.flood_zone_count !== 1 ? "s" : ""}, outside SFHA`
          : "No flood zones",
      weight: 0.25,
    },
    {
      key: "soils",
      label: "Soils",
      status: screening.has_hydric ? "fail" : screening.soil_unit_count > 3 ? "flag" : "pass",
      detail: screening.has_hydric
        ? `Hydric soil \u2014 ${screening.soil_unit_count} unit${screening.soil_unit_count !== 1 ? "s" : ""}`
        : `${screening.soil_unit_count} unit${screening.soil_unit_count !== 1 ? "s" : ""}, stable`,
      weight: 0.15,
    },
    {
      key: "wetlands",
      label: "Wetlands",
      status: screening.has_wetlands
        ? screening.wetland_count > 2 ? "fail" : "flag"
        : "pass",
      detail: screening.has_wetlands
        ? `${screening.wetland_count} wetland${screening.wetland_count !== 1 ? "s" : ""} detected`
        : "None detected",
      weight: 0.2,
    },
    {
      key: "epa",
      label: "EPA",
      status: screening.has_nearby_epa_facilities
        ? screening.epa_facility_count > 3 ? "fail" : "flag"
        : "pass",
      detail: screening.has_nearby_epa_facilities
        ? `${screening.epa_facility_count} facilit${screening.epa_facility_count !== 1 ? "ies" : "y"} nearby`
        : "No facilities nearby",
      weight: 0.2,
    },
    {
      key: "environmental",
      label: "Env. Overall",
      status: screening.has_environmental_constraints ? "flag" : "pass",
      detail: screening.has_environmental_constraints ? "Constraints present" : "No constraints",
      weight: 0.2,
    },
  ];
}

function computeInvestabilityScore(dimensions: ScreeningDimension[]): number {
  let totalWeight = 0;
  let weightedSum = 0;
  for (const d of dimensions) {
    totalWeight += d.weight;
    const value = d.status === "pass" ? 100 : d.status === "flag" ? 50 : d.status === "fail" ? 0 : 50;
    weightedSum += value * d.weight;
  }
  return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 50;
}

const STATUS_COLORS: Record<ScreeningDimension["status"], { bar: string; text: string }> = {
  pass: { bar: "bg-emerald-500", text: "text-emerald-400" },
  flag: { bar: "bg-amber-500", text: "text-amber-400" },
  fail: { bar: "bg-red-500", text: "text-red-400" },
  unknown: { bar: "bg-slate-500", text: "text-slate-400" },
};

function scoreColor(score: number): string {
  if (score >= 70) return "text-emerald-400";
  if (score >= 40) return "text-amber-400";
  return "text-red-400";
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={cn(
        "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
        ok ? "bg-emerald-500" : "bg-red-500",
      )}
    />
  );
}

export function ScreeningScorecard({ parcelId, className }: Props) {
  const { screening, isLoading, error } = useParcelScreening(parcelId);

  if (!parcelId) return null;
  if (isLoading) {
    return (
      <div className={cn("flex flex-col gap-2 rounded-lg border border-border bg-muted p-3", className)}>
        <Skeleton className="h-4 w-32" />
        <div className="mt-2 grid grid-cols-2 gap-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-12 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }
  if (error || !screening) return null;

  const items = [
    {
      icon: Droplets,
      label: "Flood",
      ok: !screening.in_sfha,
      detail: screening.in_sfha
        ? `SFHA — ${screening.flood_zone_count} zone${screening.flood_zone_count !== 1 ? "s" : ""}`
        : "Outside SFHA",
    },
    {
      icon: Mountain,
      label: "Soils",
      ok: !screening.has_hydric,
      detail: screening.has_hydric
        ? `Hydric soil detected — ${screening.soil_unit_count} unit${screening.soil_unit_count !== 1 ? "s" : ""}`
        : `${screening.soil_unit_count} unit${screening.soil_unit_count !== 1 ? "s" : ""} — no hydric`,
    },
    {
      icon: TreePine,
      label: "Wetlands",
      ok: !screening.has_wetlands,
      detail: screening.has_wetlands
        ? `${screening.wetland_count} wetland${screening.wetland_count !== 1 ? "s" : ""} detected`
        : "None detected",
    },
    {
      icon: Factory,
      label: "EPA",
      ok: !screening.has_nearby_epa_facilities,
      detail: screening.has_nearby_epa_facilities
        ? `${screening.epa_facility_count} facilit${screening.epa_facility_count !== 1 ? "ies" : "y"} within 1 mi`
        : "No facilities within 1 mi",
    },
  ];

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        Site Screening
      </p>
      <div className="grid grid-cols-2 gap-1.5">
        {items.map((item) => (
          <div
            key={item.label}
            className={cn(
              "flex items-start gap-2 rounded-lg border px-2.5 py-2 text-xs",
              item.ok ? "border-border" : "border-red-500/30 bg-red-500/5",
            )}
          >
            <item.icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-medium">{item.label}</span>
                <StatusDot ok={item.ok} />
                <Badge
                  variant={item.ok ? "secondary" : "destructive"}
                  className="px-1.5 py-0 text-[8px]"
                >
                  {item.ok ? "Clear" : "Flag"}
                </Badge>
              </div>
              <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                {item.detail}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Investability Waterfall */}
      {(() => {
        const dimensions = deriveWaterfallDimensions(screening);
        const investabilityScore = computeInvestabilityScore(dimensions);
        return (
          <div className="mt-3 rounded-lg border border-border bg-muted p-3">
            <div className="flex items-center justify-between">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Investability Score
              </p>
              <span className={cn("text-2xl font-bold tabular-nums", scoreColor(investabilityScore))}>
                {investabilityScore}
              </span>
            </div>

            <div className="mt-2.5 space-y-1.5">
              {dimensions.map((dim) => {
                const colors = STATUS_COLORS[dim.status];
                const barWidthPercent = dim.weight * 100;
                return (
                  <div key={dim.key} className="flex items-center gap-2 text-[10px]">
                    <span className="w-16 shrink-0 text-right font-medium text-muted-foreground">
                      {dim.label}
                    </span>
                    <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn("absolute inset-y-0 left-0 rounded-full", colors.bar)}
                        style={{ width: `${barWidthPercent}%` }}
                      />
                    </div>
                    <span className={cn("w-10 shrink-0 text-[9px] font-medium uppercase", colors.text)}>
                      {dim.status}
                    </span>
                    <span className="hidden min-[400px]:inline truncate text-[9px] text-muted-foreground">
                      {dim.detail}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
