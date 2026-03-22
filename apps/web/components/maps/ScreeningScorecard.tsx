"use client";

import { useParcelScreening } from "@/hooks/useParcelScreening";
import { cn } from "@/lib/utils";
import { Droplets, Mountain, TreePine, Factory } from "lucide-react";

type Props = { parcelId: string | null; className?: string };

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
      <div className={cn("animate-pulse rounded-lg border border-border/40 bg-muted/20 p-3", className)}>
        <div className="h-4 w-32 rounded bg-muted/40" />
        <div className="mt-2 grid grid-cols-2 gap-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-12 rounded bg-muted/30" />
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
    <div className={cn("space-y-1.5", className)}>
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        Site Screening
      </p>
      <div className="grid grid-cols-2 gap-1.5">
        {items.map((item) => (
          <div
            key={item.label}
            className={cn(
              "flex items-start gap-2 rounded-lg border px-2.5 py-2 text-xs",
              item.ok ? "border-border/40" : "border-red-500/30 bg-red-500/5",
            )}
          >
            <item.icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-medium">{item.label}</span>
                <StatusDot ok={item.ok} />
              </div>
              <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                {item.detail}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
