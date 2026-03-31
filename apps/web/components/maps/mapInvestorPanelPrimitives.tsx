"use client";

import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type {
  MapWorkbenchResourceKind,
  MapWorkbenchResourceStatus,
} from "./mapInvestorWorkbench.types";

export function statusClasses(status: MapWorkbenchResourceStatus): string {
  switch (status.kind) {
    case "ready":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
    case "loading":
      return "border-sky-500/30 bg-sky-500/10 text-sky-200";
    case "empty":
      return "border-map-border bg-map-surface/50 text-map-text-secondary";
    case "fallback":
      return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  }
}

export function holdoutRiskStatusKind(
  risk: "low" | "medium" | "high",
): MapWorkbenchResourceKind {
  switch (risk) {
    case "low":
      return "ready";
    case "medium":
      return "fallback";
    case "high":
      return "empty";
  }
}

export function overlayAvailabilityClasses(
  availability: "live" | "fallback" | "unavailable",
): string {
  switch (availability) {
    case "live":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
    case "fallback":
      return "border-amber-500/30 bg-amber-500/10 text-amber-200";
    case "unavailable":
      return "border-map-border bg-map-surface text-map-text-secondary";
  }
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-map-text-muted">
      {children}
    </p>
  );
}

export function SectionFrame({
  icon,
  title,
  description,
  status,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  status: MapWorkbenchResourceStatus;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="rounded-xl border border-map-border bg-map-surface/45 px-3 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 gap-3">
            <div className="mt-0.5 rounded-lg border border-map-border bg-map-surface p-2 text-map-text-secondary">
              {icon}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-map-text-primary">{title}</p>
              <p className="mt-1 text-[10px] leading-5 text-map-text-muted">{description}</p>
            </div>
          </div>
          <Badge
            variant="outline"
            className={cn("shrink-0 px-2 py-0.5 text-[9px]", statusClasses(status))}
          >
            {status.kind}
          </Badge>
        </div>
        <p className="mt-3 text-[10px] leading-5 text-map-text-muted">{status.detail}</p>
        <Separator className="my-3 bg-map-border" />
        {children}
      </div>
    </section>
  );
}
