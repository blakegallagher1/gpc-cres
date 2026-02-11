"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  Loader2,
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  RefreshCcw,
  Zap,
} from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MetricCard } from "@/components/portfolio/MetricCard";
import { timeAgo } from "@/lib/utils";
import type {
  AutomationEventRecord,
  AutomationStats,
  HandlerHealth,
} from "@/lib/services/automationEvent.service";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    case "failed":
      return <XCircle className="h-4 w-4 text-red-500" />;
    case "running":
      return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
    default:
      return <Clock className="h-4 w-4 text-muted-foreground" />;
  }
}

function HealthBadge({ status }: { status: HandlerHealth["status"] }) {
  const map = {
    healthy: { color: "bg-emerald-100 text-emerald-700", label: "Healthy" },
    degraded: { color: "bg-amber-100 text-amber-700", label: "Degraded" },
    failing: { color: "bg-red-100 text-red-700", label: "Failing" },
    inactive: { color: "bg-gray-100 text-gray-500", label: "Inactive" },
  };
  const cfg = map[status];
  return (
    <Badge className={`${cfg.color} text-[10px]`}>{cfg.label}</Badge>
  );
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "--";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export default function AutomationPage() {
  const { data: stats } = useSWR<AutomationStats>(
    "/api/automation/events?view=stats",
    fetcher,
    { refreshInterval: 30000 }
  );
  const { data: feedData, mutate: mutateFeed } = useSWR<{
    events: AutomationEventRecord[];
  }>("/api/automation/events?view=feed", fetcher, {
    refreshInterval: 10000,
  });
  const { data: healthData } = useSWR<{ handlers: HandlerHealth[] }>(
    "/api/automation/events?view=health",
    fetcher,
    { refreshInterval: 30000 }
  );
  const { data: failureData } = useSWR<{
    events: AutomationEventRecord[];
  }>("/api/automation/events?view=failures", fetcher, {
    refreshInterval: 30000,
  });

  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);

  return (
    <DashboardShell>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Automation Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            Monitor all 12 automation loops in real time
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => mutateFeed()}
          className="gap-1"
        >
          <RefreshCcw className="h-3 w-3" />
          Refresh
        </Button>
      </div>

      {/* Stats Bar */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Runs Today"
          value={String(stats?.totalToday ?? 0)}
          icon={Zap}
        />
        <MetricCard
          label="Success Rate"
          value={stats ? `${stats.successRateToday}%` : "--"}
          icon={CheckCircle2}
        />
        <MetricCard
          label="Avg Duration"
          value={formatDuration(stats?.avgDurationMs ?? null)}
          icon={Clock}
        />
        <MetricCard
          label="Failures"
          value={String(stats?.failuresRequiringAttention ?? 0)}
          icon={AlertTriangle}
        />
      </div>

      <Tabs defaultValue="feed" className="mt-6">
        <TabsList>
          <TabsTrigger value="feed">Live Feed</TabsTrigger>
          <TabsTrigger value="health">Handler Health</TabsTrigger>
          <TabsTrigger value="failures">
            Failures
            {(failureData?.events?.length ?? 0) > 0 && (
              <Badge variant="destructive" className="ml-1 text-[9px]">
                {failureData?.events.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="feed" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Recent Events</CardTitle>
              <CardDescription className="text-xs">
                Auto-refreshes every 10 seconds
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!feedData ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : feedData.events.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No automation events recorded yet. Events will appear as
                  automation handlers execute.
                </p>
              ) : (
                <div className="max-h-[500px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8 text-xs"></TableHead>
                        <TableHead className="text-xs">Handler</TableHead>
                        <TableHead className="text-xs">Event</TableHead>
                        <TableHead className="text-xs">Duration</TableHead>
                        <TableHead className="text-right text-xs">
                          Time
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {feedData.events.map((ev) => (
                        <TableRow
                          key={ev.id}
                          className="cursor-pointer"
                          onClick={() =>
                            setExpandedEvent(
                              expandedEvent === ev.id ? null : ev.id
                            )
                          }
                        >
                          <TableCell>
                            <StatusIcon status={ev.status} />
                          </TableCell>
                          <TableCell className="text-xs font-medium">
                            {ev.handlerName}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {ev.eventType}
                          </TableCell>
                          <TableCell className="text-xs tabular-nums">
                            {formatDuration(ev.durationMs)}
                          </TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground">
                            {timeAgo(ev.startedAt)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="health" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Handler Health (7-Day)</CardTitle>
            </CardHeader>
            <CardContent>
              {!healthData ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Handler</TableHead>
                      <TableHead className="text-center text-xs">
                        Status
                      </TableHead>
                      <TableHead className="text-right text-xs">
                        Total Runs
                      </TableHead>
                      <TableHead className="text-right text-xs">
                        Success Rate
                      </TableHead>
                      <TableHead className="text-right text-xs">
                        Avg Duration
                      </TableHead>
                      <TableHead className="text-right text-xs">
                        Last Run
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {healthData.handlers.map((h) => (
                      <TableRow key={h.handlerName}>
                        <TableCell className="text-xs font-medium">
                          {h.handlerName}
                        </TableCell>
                        <TableCell className="text-center">
                          <HealthBadge status={h.status} />
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums">
                          {h.totalRuns7d}
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums">
                          <span
                            className={
                              h.successRate7d < 60
                                ? "text-red-600 font-semibold"
                                : h.successRate7d < 90
                                ? "text-amber-600"
                                : "text-emerald-600"
                            }
                          >
                            {h.successRate7d}%
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums">
                          {formatDuration(h.avgDurationMs)}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {h.lastRunAt ? timeAgo(h.lastRunAt) : "Never"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="failures" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Failed Events</CardTitle>
              <CardDescription className="text-xs">
                Recent handler failures with error details
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!failureData ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : failureData.events.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No failures detected. All handlers are running clean.
                </p>
              ) : (
                <div className="space-y-3">
                  {failureData.events.map((ev) => (
                    <div
                      key={ev.id}
                      className="rounded-lg border border-red-200 bg-red-50/30 p-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <XCircle className="h-4 w-4 text-red-500" />
                          <span className="text-sm font-medium">
                            {ev.handlerName}
                          </span>
                          <Badge variant="outline" className="text-[10px]">
                            {ev.eventType}
                          </Badge>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {timeAgo(ev.startedAt)}
                        </span>
                      </div>
                      {ev.error && (
                        <p className="mt-2 rounded bg-red-100/50 p-2 font-mono text-xs text-red-700">
                          {ev.error}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </DashboardShell>
  );
}
