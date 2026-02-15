"use client";

import { useMemo, useState, useCallback } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  Sparkles,
  AlertTriangle,
  Zap,
  BarChart3,
  Loader2,
  RefreshCw,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  Download,
} from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { OpportunityFeed } from "@/components/opportunities/OpportunityFeed";
import { DeadlinesWidget } from "@/components/intelligence/DeadlinesWidget";
import { EntitlementKpiWidget } from "@/components/intelligence/EntitlementKpiWidget";
import { toast } from "sonner";
import { PIPELINE_STAGES } from "@/lib/data/portfolioConstants";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface BriefingData {
  generatedAt: string;
  summary: string;
  sections: {
    newActivity: { label: string; items: string[] };
    needsAttention: {
      label: string;
      items: Array<{
        title: string;
        dealId: string;
        dealName: string;
        reason: string;
      }>;
    };
    automationActivity: {
      label: string;
      items: Array<{
        title: string;
        status: string;
        dealName: string | null;
        createdAt: string;
      }>;
    };
    pipelineSnapshot: {
      label: string;
      stages: Array<{ status: string; count: number }>;
    };
  };
}

interface DeadlineTimelineItem {
  taskId: string;
  dueAt: string;
}

interface DeadlineTimelinePayload {
  deadlines: DeadlineTimelineItem[];
}

interface DeadlineTimelineBucket {
  label: string;
  count: number;
}

interface PortfolioDealSnapshot {
  status: string;
  updatedAt: string;
}

interface PortfolioSnapshotPayload {
  deals: PortfolioDealSnapshot[];
}

interface PipelineDayBucket {
  dateKey: string;
  label: string;
  total: number;
  countByStatus: Record<string, number>;
}

interface PipelineDayTimeline {
  buckets: PipelineDayBucket[];
}

const STAGE_ORDER = [
  "INTAKE",
  "TRIAGE_DONE",
  "PREAPP",
  "CONCEPT",
  "NEIGHBORS",
  "SUBMITTED",
  "HEARING",
  "APPROVED",
  "EXIT_MARKETED",
];

const STAGE_LABELS: Record<string, string> = {
  INTAKE: "Intake",
  TRIAGE_DONE: "Triaged",
  PREAPP: "Pre-App",
  CONCEPT: "Concept",
  NEIGHBORS: "Neighbors",
  SUBMITTED: "Submitted",
  HEARING: "Hearing",
  APPROVED: "Approved",
  EXIT_MARKETED: "Marketing",
};

const statusIcon: Record<string, React.ElementType> = {
  succeeded: CheckCircle2,
  running: Loader2,
  failed: XCircle,
};

const statusColor: Record<string, string> = {
  succeeded: "text-green-500",
  running: "text-blue-500 animate-spin",
  failed: "text-red-500",
};

function buildPipelineDayTimeline(deals: PortfolioDealSnapshot[], days = 14): PipelineDayTimeline {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const activeStatuses = new Set([
    "INTAKE",
    "TRIAGE_DONE",
    "PREAPP",
    "CONCEPT",
    "NEIGHBORS",
    "SUBMITTED",
    "HEARING",
    "APPROVED",
    "EXIT_MARKETED",
  ]);

  const bucketMap = new Map<string, PipelineDayBucket>();
  const buckets: PipelineDayBucket[] = [];
  const buildDateKey = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
      date.getDate()
    ).padStart(2, "0")}`;

  for (let i = days - 1; i >= 0; i -= 1) {
    const day = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const dateKey = buildDateKey(day);
    const label = day.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    const bucket: PipelineDayBucket = {
      dateKey,
      label,
      total: 0,
      countByStatus: {},
    };
    buckets.push(bucket);
    bucketMap.set(dateKey, bucket);
  }

  for (const deal of deals) {
    if (!activeStatuses.has(deal.status)) {
      continue;
    }

    const updatedAt = new Date(deal.updatedAt);
    if (Number.isNaN(updatedAt.getTime())) {
      continue;
    }

    const day = new Date(updatedAt);
    day.setHours(0, 0, 0, 0);

    if (day > now) {
      continue;
    }

    const diffDays = Math.floor((now.getTime() - day.getTime()) / (24 * 60 * 60 * 1000));
    if (diffDays < 0 || diffDays >= days) {
      continue;
    }

    const bucket = bucketMap.get(buildDateKey(day));
    if (!bucket) {
      continue;
    }

    bucket.total += 1;
    bucket.countByStatus[deal.status] = (bucket.countByStatus[deal.status] ?? 0) + 1;
  }

  return { buckets };
}

function PipelineDayTimelinePanel({
  deals,
  isLoading,
}: {
  deals: PortfolioDealSnapshot[];
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Day-level pipeline timeline</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-8 animate-pulse rounded bg-muted" />
          ))}
        </CardContent>
      </Card>
    );
  }

  const { buckets } = buildPipelineDayTimeline(deals);
  const hasData = buckets.some((bucket) => bucket.total > 0);
  const visibleStatuses = PIPELINE_STAGES.filter((stage) =>
    buckets.some((bucket) => (bucket.countByStatus[stage.key] ?? 0) > 0)
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Day-level pipeline timeline</CardTitle>
          <span className="text-xs text-muted-foreground">14-day activity by status</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {!hasData ? (
          <p className="text-sm text-muted-foreground">
            No recent pipeline activity found in the last 14 days.
          </p>
        ) : (
          buckets.map((bucket) => {
            const stageEntries = visibleStatuses
              .map((stage) => ({
                label: stage.label,
                color: stage.color,
                count: bucket.countByStatus[stage.key] ?? 0,
              }))
              .filter((entry) => entry.count > 0);

            const otherCount =
              bucket.total -
              stageEntries.reduce((sum, item) => sum + item.count, 0);

            return (
              <div key={bucket.dateKey} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span>{bucket.label}</span>
                  <span className="text-muted-foreground">
                    {bucket.total} deal{bucket.total === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  {bucket.total === 0 ? (
                    <div className="h-full w-full bg-muted" />
                  ) : (
                    <>
                      {stageEntries.map((entry) => (
                        <span
                          key={entry.label}
                          title={`${entry.label}: ${entry.count}`}
                          className="inline-block h-full transition-all"
                          style={{
                            width: `${Math.max((entry.count / bucket.total) * 100, 0)}%`,
                            backgroundColor: entry.color,
                          }}
                        />
                      ))}
                      {otherCount > 0 ? (
                        <span
                          key="other"
                          title={`Other: ${otherCount}`}
                          className="inline-block h-full"
                          style={{
                            width: `${Math.max((otherCount / bucket.total) * 100, 0)}%`,
                            backgroundColor: "#94a3b8",
                          }}
                        />
                      ) : null}
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
        {hasData ? (
          <div className="pt-2">
            <p className="mb-2 text-xs text-muted-foreground">Legend</p>
            <div className="flex flex-wrap gap-2">
              {visibleStatuses.map((stage) => (
                <span
                  key={stage.key}
                  className="inline-flex items-center gap-1.5 text-xs"
                >
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: stage.color }}
                  />
                  {stage.label}
                </span>
              ))}
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="inline-block h-2 w-2 rounded-full bg-slate-400" />
                Other
              </span>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function buildDeadlineTimeline(deadlines: DeadlineTimelineItem[]) {
  const buckets: DeadlineTimelineBucket[] = [
    { label: "Overdue", count: 0 },
    { label: "Today", count: 0 },
    { label: "Tomorrow", count: 0 },
    { label: "2 days", count: 0 },
    { label: "3 days", count: 0 },
    { label: "4 days", count: 0 },
    { label: "5 days", count: 0 },
    { label: "6 days", count: 0 },
    { label: "7+ days", count: 0 },
  ];

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  for (const deadline of deadlines) {
    const due = new Date(deadline.dueAt);
    if (Number.isNaN(due.getTime())) {
      continue;
    }

    due.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      buckets[0].count += 1;
      continue;
    }

    if (diffDays === 0) {
      buckets[1].count += 1;
      continue;
    }

    if (diffDays >= 7) {
      buckets[8].count += 1;
      continue;
    }

    buckets[diffDays + 1].count += 1;
  }

  const maxCount = Math.max(...buckets.map((bucket) => bucket.count), 1);

  return { buckets, maxCount };
}

function DeadlineTimelinePanel({
  deadlines,
  isLoading,
}: {
  deadlines: DeadlineTimelineItem[];
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Deadline timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-muted" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const { buckets, maxCount } = buildDeadlineTimeline(deadlines);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Deadline timeline</CardTitle>
          <span className="text-xs text-muted-foreground">
            {deadlines.length} deadline(s) loaded
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {deadlines.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No deadline points available for the selected range.
          </p>
        ) : (
          buckets.map((bucket) => (
            <div key={bucket.label} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span>{bucket.label}</span>
                <span className="text-muted-foreground">{bucket.count}</span>
              </div>
              <div className="h-2 rounded-full bg-muted">
                <div
                  className="h-2 rounded-full bg-blue-500 transition-all"
                  style={{
                    width: `${(bucket.count / maxCount) * 100}%`,
                  }}
                />
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

export default function CommandCenterPage() {
  const {
    data: briefing,
    isLoading,
    mutate,
  } = useSWR<BriefingData>("/api/intelligence/daily-briefing", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60000,
  });

  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await mutate();
    setRefreshing(false);
  };

  const totalActive =
    briefing?.sections.pipelineSnapshot.stages.reduce(
      (acc, s) => acc + s.count,
      0
    ) ?? 0;

  const { data: portfolioPayload, isLoading: portfolioSnapshotLoading } = useSWR<PortfolioSnapshotPayload>(
    "/api/portfolio",
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 60000,
    }
  );

  const portfolioDeals = useMemo(
    () => portfolioPayload?.deals ?? [],
    [portfolioPayload?.deals]
  );

  const { data: deadlinesPayload, isLoading: deadlinesLoading } = useSWR<DeadlineTimelinePayload>(
    "/api/intelligence/deadlines",
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 60000,
    }
  );
  const deadlineEvents = deadlinesPayload?.deadlines ?? [];
  const [isExporting, setIsExporting] = useState(false);

  const handleExportCommandCenter = useCallback(() => {
    if (isExporting || !briefing) return;

    setIsExporting(true);

    try {
      const escapeCsvCell = (value: string) =>
        `"${value.replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;

      const rows: string[] = [];

      rows.push("# Command Center Export");
      rows.push(`"generatedAt","${briefing.generatedAt}"`);
      rows.push("");

      rows.push("## New Activity");
      rows.push('"item"');
      briefing.sections.newActivity.items.forEach((item) => {
        rows.push(escapeCsvCell(item));
      });
      rows.push("");

      rows.push("## Needs Attention");
      rows.push('"title","dealId","dealName","reason"');
      briefing.sections.needsAttention.items.forEach((item) => {
        rows.push(
          [
            escapeCsvCell(item.title),
            escapeCsvCell(item.dealId),
            escapeCsvCell(item.dealName),
            escapeCsvCell(item.reason),
          ].join(",")
        );
      });
      rows.push("");

      rows.push("## Recent Automation");
      rows.push('"title","status","dealName","createdAt"');
      briefing.sections.automationActivity.items.forEach((item) => {
        rows.push(
          [
            escapeCsvCell(item.title),
            escapeCsvCell(item.status),
            escapeCsvCell(item.dealName ?? ""),
            escapeCsvCell(item.createdAt),
          ].join(",")
        );
      });
      rows.push("");

      rows.push("## Pipeline Snapshot");
      rows.push('"status","count"');
      briefing.sections.pipelineSnapshot.stages.forEach((stage) => {
        rows.push([escapeCsvCell(stage.status), escapeCsvCell(String(stage.count))].join(","));
      });
      rows.push("");

      rows.push("## Deadlines");
      rows.push('"taskId","dueAt"');
      deadlineEvents.forEach((deadline) => {
        rows.push(
          [escapeCsvCell(deadline.taskId), escapeCsvCell(deadline.dueAt)].join(",")
        );
      });

      const csv = `\uFEFF${rows.join("\n")}`;
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute(
        "download",
        `command-center-export-${new Date().toISOString().slice(0, 10)}.csv`
      );
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success("Command center report exported.");
    } catch {
      toast.error("Failed to export command center report.");
    } finally {
      setIsExporting(false);
    }
  }, [briefing, deadlineEvents, isExporting]);

  return (
    <DashboardShell>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Command Center
            </h1>
            <p className="text-sm text-muted-foreground">
              Your daily intelligence dashboard
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCommandCenter}
              disabled={isExporting || !briefing}
            >
              <Download className="mr-2 h-4 w-4" />
              {isExporting ? "Exporting..." : "Export"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              <RefreshCw
                className={cn("mr-2 h-4 w-4", refreshing && "animate-spin")}
              />
              Refresh
            </Button>
          </div>
        </div>

        {/* Daily Briefing */}
        <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">Daily Briefing</CardTitle>
                {briefing && (
                  <p className="text-xs text-muted-foreground">
                    Generated{" "}
                    {new Date(briefing.generatedAt).toLocaleTimeString()}
                  </p>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ) : briefing ? (
              <div className="space-y-4">
                <p className="text-sm leading-relaxed">{briefing.summary}</p>
                {briefing.sections.newActivity.items.length > 0 && (
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Last 24 Hours
                    </p>
                    <ul className="space-y-0.5 text-sm">
                      {briefing.sections.newActivity.items.map((item, i) => (
                        <li
                          key={i}
                          className={cn(
                            item.startsWith("  -")
                              ? "pl-4 text-muted-foreground"
                              : "font-medium"
                          )}
                        >
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Unable to generate briefing. Check your connection and try
                refreshing.
              </p>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Needs Attention */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/10">
                  <AlertTriangle className="h-4 w-4 text-orange-500" />
                </div>
                <CardTitle className="text-base">Needs Attention</CardTitle>
                {briefing &&
                  briefing.sections.needsAttention.items.length > 0 && (
                    <Badge variant="destructive" className="ml-auto">
                      {briefing.sections.needsAttention.items.length}
                    </Badge>
                  )}
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : briefing &&
                briefing.sections.needsAttention.items.length > 0 ? (
                <div className="space-y-2">
                  {briefing.sections.needsAttention.items.map((item, i) => (
                    <Link
                      key={i}
                      href={`/deals/${item.dealId}`}
                      className="group flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {item.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {item.reason}
                        </p>
                      </div>
                      <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 py-6 text-center">
                  <CheckCircle2 className="h-8 w-8 text-green-500/40" />
                  <p className="text-sm text-muted-foreground">
                    All clear — no items need attention.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Automation Activity */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10">
                  <Zap className="h-4 w-4 text-blue-500" />
                </div>
                <CardTitle className="text-base">
                  Recent Automation
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : briefing &&
                briefing.sections.automationActivity.items.length > 0 ? (
                <div className="space-y-1.5">
                  {briefing.sections.automationActivity.items.map(
                    (item, i) => {
                      const Icon =
                        statusIcon[item.status] ?? Clock;
                      const color =
                        statusColor[item.status] ?? "text-muted-foreground";

                      return (
                        <div
                          key={i}
                          className="flex items-center gap-3 rounded-lg px-2 py-1.5"
                        >
                          <Icon className={cn("h-4 w-4 shrink-0", color)} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm">
                              {item.title}
                              {item.dealName && (
                                <span className="text-muted-foreground">
                                  {" "}
                                  — {item.dealName}
                                </span>
                              )}
                            </p>
                          </div>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {timeAgo(item.createdAt)}
                          </span>
                        </div>
                      );
                    }
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 py-6 text-center">
                  <Zap className="h-8 w-8 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">
                    No automation activity in the last 24 hours.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <DeadlinesWidget />
          <DeadlineTimelinePanel deadlines={deadlineEvents} isLoading={deadlinesLoading} />
        </div>

        <PipelineDayTimelinePanel
          deals={portfolioDeals}
          isLoading={portfolioSnapshotLoading}
        />

        {/* Entitlement KPI Trend Monitoring */}
        <EntitlementKpiWidget />

        {/* Opportunity Matches */}
        <OpportunityFeed />

        {/* Pipeline Snapshot */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10">
                  <BarChart3 className="h-4 w-4 text-purple-500" />
                </div>
                <CardTitle className="text-base">Pipeline Snapshot</CardTitle>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold">{totalActive}</p>
                <p className="text-xs text-muted-foreground">active deals</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : briefing ? (
              <div className="space-y-4">
                {/* Funnel visualization */}
                <div className="flex items-end gap-1">
                  {STAGE_ORDER.map((stage) => {
                    const data = briefing.sections.pipelineSnapshot.stages.find(
                      (s) => s.status === stage
                    );
                    const count = data?.count ?? 0;
                    const maxCount = Math.max(
                      ...briefing.sections.pipelineSnapshot.stages.map(
                        (s) => s.count
                      ),
                      1
                    );
                    const heightPct = count > 0 ? Math.max((count / maxCount) * 100, 12) : 4;

                    return (
                      <Link
                        key={stage}
                        href={`/deals?status=${stage}`}
                        className="group flex flex-1 flex-col items-center gap-1"
                      >
                        <span className="text-xs font-medium">
                          {count > 0 ? count : ""}
                        </span>
                        <div
                          className={cn(
                            "w-full rounded-t-sm transition-colors",
                            count > 0
                              ? "bg-primary/60 group-hover:bg-primary"
                              : "bg-muted"
                          )}
                          style={{ height: `${heightPct}px`, minHeight: "4px" }}
                        />
                        <span className="text-[9px] leading-tight text-muted-foreground">
                          {STAGE_LABELS[stage] ?? stage}
                        </span>
                      </Link>
                    );
                  })}
                </div>

                {/* Link to deals page */}
                <div className="flex justify-center">
                  <Link href="/deals">
                    <Button variant="ghost" size="sm" className="text-xs">
                      View all deals
                      <ExternalLink className="ml-1 h-3 w-3" />
                    </Button>
                  </Link>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No pipeline data available.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
