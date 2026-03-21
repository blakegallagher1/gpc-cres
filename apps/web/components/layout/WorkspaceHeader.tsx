"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type WorkspaceHeaderTone = "default" | "critical" | "positive";

/**
 * Small summary metric displayed in a workspace header.
 */
export interface WorkspaceStatItem {
  label: string;
  value: string;
  detail?: string;
  tone?: WorkspaceHeaderTone;
}

interface WorkspaceHeaderProps {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
  stats?: readonly WorkspaceStatItem[];
  className?: string;
}

/**
 * Shared page header used across dense operating-system routes.
 */
export function WorkspaceHeader({
  eyebrow = "Workspace",
  title,
  description,
  actions,
  stats,
  className,
}: WorkspaceHeaderProps) {
  return (
    <section className={cn("workspace-hero", className)}>
      <div className="workspace-hero-grid">
        <div className="space-y-5">
          <div className="space-y-3">
            <p className="workspace-eyebrow">{eyebrow}</p>
            <div className="space-y-3">
              <h1 className="workspace-title">{title}</h1>
              <p className="workspace-subtitle">{description}</p>
            </div>
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2.5">{actions}</div> : null}
        </div>

        {stats && stats.length > 0 ? (
          <WorkspaceStatGrid
            className="min-w-0 lg:min-w-[22rem]"
            items={stats}
          />
        ) : null}
      </div>
    </section>
  );
}

interface WorkspaceToolbarProps {
  children: ReactNode;
  className?: string;
}

/**
 * Shared control rail for filters, toggles, and bulk actions.
 */
export function WorkspaceToolbar({ children, className }: WorkspaceToolbarProps) {
  return <div className={cn("workspace-toolbar", className)}>{children}</div>;
}

interface WorkspaceStatGridProps {
  items: readonly WorkspaceStatItem[];
  className?: string;
}

/**
 * Compact stat rail used inside workspace headers and summary bands.
 */
export function WorkspaceStatGrid({ items, className }: WorkspaceStatGridProps) {
  return (
    <div className={cn("workspace-stat-grid", className)}>
      {items.map((item) => (
        <article className="workspace-stat" key={item.label}>
          <p className="workspace-stat-label">{item.label}</p>
          <p
            className={cn(
              "workspace-stat-value",
              item.tone === "critical" && "text-destructive",
              item.tone === "positive" && "text-emerald-600 dark:text-emerald-400",
            )}
          >
            {item.value}
          </p>
          {item.detail ? <p className="workspace-stat-detail">{item.detail}</p> : null}
        </article>
      ))}
    </div>
  );
}
