"use client";

import type { ElementType, ReactNode } from "react";
import Link from "next/link";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Loader2,
  RefreshCw,
  Sparkles,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatOperatorTime } from "@/lib/formatters/operatorFormatters";
import { cn } from "@/lib/utils";
import { PIPELINE_STAGES } from "@/lib/data/portfolioConstants";
import type {
  CommandCenterAttentionItem,
  CommandCenterAutomationItem,
  CommandCenterBriefing,
  CommandCenterDeadlineItem,
  CommandCenterOpportunityItem,
  CommandCenterPipelineDayBucket,
} from "./commandCenterTypes";
import {
  buildDeadlineTimeline,
  countDeadlineUrgencies,
  formatDue,
  timeAgo,
} from "./commandCenterUtils";

type SurfaceProps = {
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
};

function Surface({ title, description, action, children, className }: SurfaceProps) {
  return (
    <section
      className={cn(
        "workspace-section space-y-4",
        className,
      )}
    >
      <div className="workspace-section-header">
        <div>
          <p className="workspace-section-kicker">Command center</p>
          <h2 className="workspace-section-heading mt-2">{title}</h2>
          <p className="workspace-section-copy mt-2">{description}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

type MetricStripItem = {
  label: string;
  value: string;
  detail: string;
  tone?: "default" | "critical" | "positive";
};

/** Compact KPI strip used to orient operators when the command center loads. */
export function CommandCenterMetricStrip({
  items,
  isLoading,
}: {
  items: MetricStripItem[];
  isLoading: boolean;
}) {
  return (
    <section className="workspace-kpi-grid">
      {items.map((item) => (
        <div
          key={item.label}
          className="workspace-kpi"
        >
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-3 w-32" />
            </div>
          ) : (
            <>
              <p className="workspace-section-kicker">
                {item.label}
              </p>
              <p
                className={cn(
                  "mt-2 text-3xl font-semibold tracking-tight",
                  item.tone === "critical"
                    ? "text-destructive"
                    : item.tone === "positive"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-foreground",
                )}
              >
                {item.value}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">{item.detail}</p>
            </>
          )}
        </div>
      ))}
    </section>
  );
}

/** Summary section for the current operating brief and the most recent activity. */
export function OperatingBriefSection({
  briefing,
  isLoading,
  error,
  onRetry,
}: {
  briefing?: CommandCenterBriefing;
  isLoading: boolean;
  error?: Error;
  onRetry: () => void;
}) {
  const hasData = Boolean(briefing);
  return (
    <Surface
      title="Operating brief"
      description="What changed since yesterday and what needs a decision now."
      action={
        briefing ? (
          <Badge variant="secondary">
            Generated {formatOperatorTime(briefing.generatedAt)}
          </Badge>
        ) : undefined
      }
    >
      {isLoading && !hasData ? (
        <div className="space-y-4">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </div>
      ) : error && !hasData ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-destructive">Unable to load operating brief.</p>
          <Button variant="outline" size="sm" onClick={onRetry}>
            Retry briefing
          </Button>
        </div>
      ) : briefing ? (
        <div className="space-y-5">
          {error ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300/40 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
              <span>Using cached operating brief while retrying.</span>
              <Button size="sm" variant="outline" onClick={onRetry} className="h-7 px-2">
                Retry
              </Button>
            </div>
          ) : null}
          <p className="max-w-3xl text-base leading-7 text-foreground">{briefing.summary}</p>
          <div className="workspace-list">
            {briefing.sections.newActivity.items.length > 0 ? (
              briefing.sections.newActivity.items.map((item, index) => (
                <div
                  key={`${item}-${index}`}
                  className={cn(
                    "workspace-list-row text-sm",
                    index === 0 && "pt-0",
                  )}
                >
                  <span className="mt-0.5 h-2 w-2 rounded-full bg-primary/60" />
                  <span
                    className={cn(
                      "leading-6",
                      item.startsWith("  -") ? "text-muted-foreground" : "text-foreground",
                    )}
                  >
                    {item.trim()}
                  </span>
                </div>
              ))
            ) : (
              <div className="py-6 text-sm text-muted-foreground">
                No new activity landed in the last 24 hours.
              </div>
            )}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          The briefing is unavailable right now. Refresh to try again.
        </p>
      )}
    </Surface>
  );
}

/** Dense priority queue for deals that need operator review or escalation. */
export function PriorityQueueSection({
  items,
  isLoading,
}: {
  items: CommandCenterAttentionItem[];
  isLoading: boolean;
}) {
  return (
    <Surface
      title="Priority queue"
      description="Items that need a decision, intervention, or follow-up next."
      action={items.length > 0 ? <Badge variant="destructive">{items.length}</Badge> : undefined}
    >
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </div>
      ) : items.length > 0 ? (
        <div className="workspace-list">
          {items.map((item) => (
            <Link
              key={`${item.dealId}-${item.title}`}
              href={`/deals/${item.dealId}`}
              className="workspace-list-row group items-start transition-colors hover:bg-muted"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold">{item.title}</p>
                  <Badge variant="outline" className="hidden sm:inline-flex">
                    {item.dealName}
                  </Badge>
                </div>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.reason}</p>
              </div>
              <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-foreground" />
            </Link>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-3 border-t border-border py-5">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          <p className="text-sm text-muted-foreground">No items are waiting for intervention.</p>
        </div>
      )}
    </Surface>
  );
}

/** Opportunity intake section for the highest-signal parcel matches. */
export function OpportunityRadarSection({
  opportunities,
  total,
  isLoading,
  error,
  onRetry,
}: {
  opportunities: CommandCenterOpportunityItem[];
  total: number;
  isLoading: boolean;
  error?: Error;
  onRetry: () => void;
}) {
  return (
    <Surface
      title="Opportunity radar"
      description="Fresh parcel matches with a clear angle and next action."
      action={
        <Button variant="outline" size="sm" asChild>
          <Link href="/opportunities">
            Review queue
            <ExternalLink className="ml-2 h-3.5 w-3.5" />
          </Link>
        </Button>
      }
    >
      {isLoading && opportunities.length === 0 ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, index) => (
            <Skeleton key={index} className="h-20 w-full" />
          ))}
        </div>
      ) : error && opportunities.length === 0 ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-destructive">Unable to load opportunities.</p>
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
            Retry opportunities
          </Button>
        </div>
      ) : opportunities.length > 0 ? (
        <div className="workspace-list">
          {error ? (
            <div className="border-b border-border bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-200">
              Opportunity data could not be refreshed. Using cached data.
              <Button size="sm" variant="ghost" onClick={onRetry} className="ml-3 h-6 px-2">
                <RefreshCw className="mr-1 h-3.5 w-3.5" />
                Retry
              </Button>
            </div>
          ) : null}
          {opportunities.map((item) => {
            const matchScore = Math.round(Number(item.matchScore));
            return (
              <Link
                key={item.id}
                href="/opportunities"
                className="workspace-list-row group grid gap-3 transition-colors hover:bg-muted md:grid-cols-[minmax(0,1fr)_auto]"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold">
                      {item.parcelData.address || item.parcelData.ownerName || item.parcelData.parcelUid}
                    </p>
                    <Badge variant="secondary">{item.savedSearch.name}</Badge>
                  </div>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {item.thesis.summary}
                  </p>
                  <p className="mt-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    Next action: {item.thesis.nextBestAction}
                  </p>
                </div>
                <div className="flex items-start gap-3 md:flex-col md:items-end">
                  <div className="rounded-full border border-border px-3 py-1 text-sm font-semibold">
                    {matchScore}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {timeAgo(item.createdAt)}
                  </span>
                </div>
              </Link>
            );
          })}
          <div className="flex items-center justify-between px-4 py-3 text-sm text-muted-foreground">
            <span>{total} total opportunities in the current queue.</span>
            <Link
              href="/opportunities"
              className="inline-flex items-center gap-1 font-medium text-foreground"
            >
              Review all
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-muted px-4 py-5">
          <Sparkles className="h-5 w-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            The queue is clear. New parcel matches will appear here after the next scan.
          </p>
        </div>
      )}
    </Surface>
  );
}

/** Pipeline stage view and recent activity cadence for the active deal set. */
export function PipelineFlowSection({
  briefing,
  cadenceBuckets,
  isLoading,
  error,
  onRetry,
}: {
  briefing?: CommandCenterBriefing;
  cadenceBuckets: CommandCenterPipelineDayBucket[];
  isLoading: boolean;
  error?: Error;
  onRetry: () => void;
}) {
  const stages = briefing?.sections.pipelineSnapshot.stages ?? [];
  const totalActive = stages.reduce((sum, stage) => sum + stage.count, 0);
  const visibleStatuses = PIPELINE_STAGES.filter((stage) =>
    cadenceBuckets.some((bucket) => (bucket.countByStatus[stage.key] ?? 0) > 0),
  );

  return (
    <Surface
      title="Pipeline flow"
      description="Stage distribution and recent movement across active deals."
      action={briefing ? <Badge variant="secondary">{totalActive} active</Badge> : undefined}
    >
      {isLoading && !briefing ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <Skeleton className="h-56 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
      ) : briefing ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          {error ? (
            <div className="col-span-2 rounded-xl border border-amber-300/40 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
              Pipeline snapshot could not be refreshed. Showing cached values.
              <Button size="sm" variant="outline" onClick={onRetry} className="ml-3 h-6 px-2">
                <RefreshCw className="mr-1 h-3.5 w-3.5" />
                Retry
              </Button>
            </div>
          ) : null}
          <div className="space-y-3">
            {PIPELINE_STAGES.filter((stage) =>
              stages.some((entry) => entry.status === stage.key),
            ).map((stage) => {
              const count = stages.find((entry) => entry.status === stage.key)?.count ?? 0;
              const width =
                totalActive > 0
                  ? Math.max((count / totalActive) * 100, count > 0 ? 8 : 0)
                  : 0;

              return (
                <Link
                  key={stage.key}
                  href={`/deals?status=${stage.key}`}
                  className="block rounded-xl border border-border px-4 py-3 transition-colors hover:bg-muted"
                >
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{stage.label}</span>
                    <span className="text-muted-foreground">{count}</span>
                  </div>
                  <div className="mt-3 h-1.5 rounded-full bg-muted">
                    <div
                      className="h-1.5 rounded-full transition-all"
                      style={{ width: `${width}%`, backgroundColor: stage.color }}
                    />
                  </div>
                </Link>
              );
            })}
          </div>

          <div className="rounded-xl border border-border p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              14-day cadence
            </p>
            <div className="mt-4 space-y-3">
              {cadenceBuckets.some((bucket) => bucket.total > 0) ? (
                cadenceBuckets.map((bucket) => (
                  <div key={bucket.dateKey} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span>{bucket.label}</span>
                      <span className="text-muted-foreground">{bucket.total}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      {bucket.total > 0 ? (
                        visibleStatuses.map((stage) => (
                          <span
                            key={`${bucket.dateKey}-${stage.key}`}
                            className="inline-block h-full"
                            style={{
                              width: `${((bucket.countByStatus[stage.key] ?? 0) / bucket.total) * 100}%`,
                              backgroundColor: stage.color,
                            }}
                          />
                        ))
                      ) : (
                        <span className="block h-full w-full bg-muted" />
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  No pipeline movement was recorded in the last 14 days.
                </p>
              )}
            </div>
          </div>
        </div>
      ) : error ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-destructive">Unable to load pipeline flow.</p>
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
            Retry pipeline
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Pipeline data is unavailable.</p>
      )}
    </Surface>
  );
}

function urgencyTextClass(urgency: CommandCenterDeadlineItem["urgency"]): string {
  if (urgency === "black") {
    return "text-foreground";
  }

  if (urgency === "red") {
    return "text-destructive";
  }

  if (urgency === "yellow") {
    return "text-amber-600 dark:text-amber-400";
  }

  return "text-emerald-600 dark:text-emerald-400";
}

/** Sticky rail section for deadline histogram and the next due work items. */
export function DeadlineLoadSection({
  deadlines,
  isLoading,
  error,
  onRetry,
}: {
  deadlines: CommandCenterDeadlineItem[];
  isLoading: boolean;
  error?: Error;
  onRetry: () => void;
}) {
  const { buckets, maxCount } = buildDeadlineTimeline(deadlines);
  const urgencyCounts = countDeadlineUrgencies(deadlines);

  return (
    <Surface
      title="Deadline load"
      description="Urgent deadlines and the next work likely to slip."
      action={
        <div className="flex items-center gap-2">
          {urgencyCounts.black > 0 ? (
            <Badge variant="destructive">{urgencyCounts.black} overdue</Badge>
          ) : null}
          {urgencyCounts.red > 0 ? (
            <Badge variant="outline">{urgencyCounts.red} due soon</Badge>
          ) : null}
        </div>
      }
      className="xl:sticky xl:top-24"
    >
      {isLoading && deadlines.length === 0 ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
          <Skeleton className="h-24 w-full" />
        </div>
      ) : error && deadlines.length === 0 ? (
        <div className="flex items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-4 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          Unable to load deadlines.
          <Button size="sm" variant="outline" onClick={onRetry} className="ml-auto h-7 px-2">
            <RefreshCw className="mr-1 h-3.5 w-3.5" />
            Retry
          </Button>
        </div>
      ) : deadlines.length > 0 ? (
        <div className="space-y-5">
          {error ? (
            <div className="rounded-xl border border-amber-300/40 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
              Deadline data could not be refreshed. Showing cached values.
              <Button size="sm" variant="ghost" onClick={onRetry} className="ml-3 h-6 px-2">
                <RefreshCw className="mr-1 h-3.5 w-3.5" />
                Retry
              </Button>
            </div>
          ) : null}
          <div className="space-y-2">
            {buckets.map((bucket) => (
              <div key={bucket.label} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span>{bucket.label}</span>
                  <span className="text-muted-foreground">{bucket.count}</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted">
                  <div
                    className="h-1.5 rounded-full bg-primary transition-all"
                    style={{ width: `${(bucket.count / maxCount) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="divide-y divide-border/60 rounded-xl border border-border">
            {deadlines.slice(0, 6).map((deadline) => (
              <Link
                key={deadline.taskId}
                href={`/deals/${deadline.dealId}`}
                className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted"
              >
                <div
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full bg-muted",
                    urgencyTextClass(deadline.urgency),
                  )}
                >
                  <Clock3 className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{deadline.taskTitle}</p>
                  <p className="truncate text-xs text-muted-foreground">{deadline.dealName}</p>
                </div>
                <span className={cn("text-xs font-semibold", urgencyTextClass(deadline.urgency))}>
                  {formatDue(deadline.hoursUntilDue)}
                </span>
              </Link>
            ))}
          </div>

          <Button variant="outline" size="sm" asChild>
            <Link href="/deals">
              Review deadline queue
              <ArrowRight className="ml-2 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-muted px-4 py-5">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          <p className="text-sm text-muted-foreground">No upcoming deadlines are loaded.</p>
        </div>
      )}
    </Surface>
  );
}

const statusIcon: Record<string, ElementType> = {
  succeeded: CheckCircle2,
  running: Loader2,
  failed: AlertCircle,
};

/** Automation feed section for recent background work and job status. */
export function AutomationStreamSection({
  items,
  isLoading,
}: {
  items: CommandCenterAutomationItem[];
  isLoading: boolean;
}) {
  return (
    <Surface
      title="Automation stream"
      description="Recent background work and the live job state attached to it."
      action={<Badge variant="secondary">24h</Badge>}
    >
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, index) => (
            <Skeleton key={index} className="h-14 w-full" />
          ))}
        </div>
      ) : items.length > 0 ? (
        <div className="divide-y divide-border/60 rounded-xl border border-border">
          {items.map((item) => {
            const Icon = statusIcon[item.status] ?? Activity;
            return (
              <div
                key={`${item.title}-${item.createdAt}`}
                className="flex items-center gap-3 px-4 py-3"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                  <Icon className={cn("h-4 w-4", item.status === "running" && "animate-spin")} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {item.title}
                    {item.dealName ? (
                      <span className="text-muted-foreground"> - {item.dealName}</span>
                    ) : null}
                  </p>
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    {item.status}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">{timeAgo(item.createdAt)}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-muted px-4 py-5">
          <Zap className="h-5 w-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No automation activity was recorded in the last 24 hours.
          </p>
        </div>
      )}
    </Surface>
  );
}
