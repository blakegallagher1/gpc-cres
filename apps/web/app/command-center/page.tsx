"use client";

import { useEffect, useState } from "react";
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
} from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { OpportunityFeed } from "@/components/opportunities/OpportunityFeed";

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
