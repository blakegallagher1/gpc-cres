"use client";

import { type LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type StatusBadgeTone = "slate" | "amber" | "blue" | "indigo" | "emerald";

interface StatusBadgeProps {
  label: string;
  tone: StatusBadgeTone;
  icon: LucideIcon;
  iconClassName?: string;
}

const toneClasses: Record<StatusBadgeTone, string> = {
  slate: "border-border/70 bg-muted/55 text-foreground",
  amber: "border-amber-200 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-100",
  blue: "border-blue-200 bg-blue-100 text-blue-900 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-100",
  indigo: "border-indigo-200 bg-indigo-100 text-indigo-900 dark:border-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-100",
  emerald: "border-emerald-200 bg-emerald-100 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-100",
};

/**
 * Shared status chip for agent/tool progress semantics.
 */
export function StatusBadge({ label, tone, icon: Icon, iconClassName }: StatusBadgeProps) {
  return (
    <Badge variant="outline" className={cn("gap-1.5 py-0.5", toneClasses[tone])}>
      <Icon className={cn("h-3 w-3", iconClassName)} />
      <span>{label}</span>
    </Badge>
  );
}
