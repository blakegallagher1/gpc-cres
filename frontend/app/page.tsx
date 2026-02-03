"use client";

import { useCallback } from "react";
import {
  Activity,
  Bot,
  Clock,
  Coins,
  Wifi,
  WifiOff,
  RefreshCw,
} from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatNumber, formatCurrency, timeAgo } from "@/lib/utils";
import { Run, DashboardStats } from "@/types";
import { useRealtime, useAutoRefresh } from "@/lib/hooks/useRealtime";
import { useAgents } from "@/lib/hooks/useAgents";
import { useRuns } from "@/lib/hooks/useRuns";
import { useDashboardStats } from "@/lib/hooks/useDashboardStats";

const emptyStats: DashboardStats = {
  totalRuns24h: 0,
  totalRunsChange: 0,
  activeAgents: 0,
  totalAgents: 0,
  avgLatency: 0,
  avgLatencyChange: 0,
  tokenUsage24h: 0,
  tokenUsageChange: 0,
  estimatedCost: 0,
};

const activityData = [
  45, 62, 38, 75, 55, 88, 42, 68, 91, 57, 73, 48, 82, 65, 77, 52, 69, 85, 44,
  71, 58, 80, 63, 50,
];

function StatCard({
  title,
  value,
  subtitle,
  change,
  icon: Icon,
}: {
  title: string;
  value: string;
  subtitle: string;
  change?: number;
  icon: React.ElementType;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <div className="flex items-center gap-2 text-xs">
          {change !== undefined && (
            <Badge
              variant={change >= 0 ? "default" : "destructive"}
              className="text-xs"
            >
              {change >= 0 ? "+" : ""}
              {change}%
            </Badge>
          )}
          <span className="text-muted-foreground">{subtitle}</span>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { agents } = useAgents();
  const { runs, mutate: mutateRuns } = useRuns({ limit: 5 });
  const { stats, mutate: mutateStats } = useDashboardStats();
  const statsData = stats ?? emptyStats;

  const updateRuns = useCallback(
    (updater: (current: Run[]) => Run[]) => {
      mutateRuns(
        (current?: { runs: Run[] }) => {
          const base = current?.runs ?? runs;
          return { runs: updater(base) };
        },
        { revalidate: false }
      );
    },
    [mutateRuns, runs]
  );

  const updateStats = useCallback(
    (updater: (current: DashboardStats) => DashboardStats) => {
      mutateStats(
        (current?: { stats: DashboardStats }) => {
          const base = current?.stats ?? statsData;
          return { stats: updater(base) };
        },
        { revalidate: false }
      );
    },
    [mutateStats, statsData]
  );

  // Fetch dashboard data
  const fetchDashboardData = useCallback(async () => {
    try {
      await Promise.all([mutateStats(), mutateRuns()]);
    } catch (error) {
      console.error("Failed to fetch dashboard data:", error);
    }
  }, [mutateStats, mutateRuns]);

  // Real-time connection with notifications
  const { isConnected } = useRealtime({
    onRunStarted: (data) => {
      const newRun: Run = {
        id: (data as { runId: string }).runId,
        agent_id: (data as { agent: string }).agent,
        status: "running",
        tokens_used: 0,
        started_at: new Date().toISOString(),
      };
      updateRuns((prev) => [newRun, ...prev.slice(0, 4)]);
    },
    onRunCompleted: (data) => {
      const runId = (data as { runId: string }).runId;
      updateRuns((prev) =>
        prev.map((run) =>
          run.id === runId
            ? { ...run, status: "success", duration_ms: Math.floor(Math.random() * 200000) }
            : run
        )
      );
    },
    onRunFailed: (data) => {
      const runId = (data as { runId: string }).runId;
      updateRuns((prev) =>
        prev.map((run) => (run.id === runId ? { ...run, status: "error" } : run))
      );
    },
    onMetricUpdate: (data) => {
      const metricData = data as { totalRuns24h?: number; tokenUsage24h?: number };
      updateStats((prev) => ({
        ...prev,
        ...(metricData.totalRuns24h !== undefined && {
          totalRuns24h: metricData.totalRuns24h,
        }),
        ...(metricData.tokenUsage24h !== undefined && {
          tokenUsage24h: metricData.tokenUsage24h,
        }),
      }));
    },
  });

  // Auto-refresh dashboard metrics every 30 seconds
  const { isRefreshing, lastRefresh, refresh } = useAutoRefresh(fetchDashboardData, 30000);

  return (
    <DashboardShell>
      {/* Connection Status Bar */}
      <div className="mb-4 flex items-center justify-between rounded-lg border bg-card px-4 py-2">
        <div className="flex items-center gap-4">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-2">
                  {isConnected ? (
                    <>
                      <Wifi className="h-4 w-4 text-green-500" />
                      <span className="text-sm text-green-600">Live</span>
                    </>
                  ) : (
                    <>
                      <WifiOff className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Offline</span>
                    </>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>{isConnected ? "Real-time updates active" : "Reconnecting..."}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {lastRefresh && (
            <span className="text-xs text-muted-foreground">
              Last updated: {timeAgo(lastRefresh.toISOString())}
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={refresh}
          disabled={isRefreshing}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>
      <div className="space-y-6">
        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total Runs (24h)"
            value={formatNumber(statsData.totalRuns24h)}
            subtitle="1,234 successful"
            change={statsData.totalRunsChange}
            icon={Activity}
          />
          <StatCard
            title="Active Agents"
            value={`${statsData.activeAgents}/${statsData.totalAgents}`}
            subtitle="3 idle, 0 error"
            icon={Bot}
          />
          <StatCard
            title="Avg Latency"
            value={`${statsData.avgLatency}s`}
            subtitle="P95: 2.4s"
            change={statsData.avgLatencyChange}
            icon={Clock}
          />
          <StatCard
            title="Token Usage"
            value={formatNumber(statsData.tokenUsage24h)}
            subtitle={formatCurrency(statsData.estimatedCost) + " estimated"}
            change={statsData.tokenUsageChange}
            icon={Coins}
          />
        </div>

        {/* Main Content */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Activity Chart */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Activity (24h)</CardTitle>
              <div className="flex gap-2">
                <Button variant="default" size="sm">
                  24h
                </Button>
                <Button variant="outline" size="sm">
                  7d
                </Button>
                <Button variant="outline" size="sm">
                  30d
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex h-48 items-end gap-1">
                {activityData.map((height, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-t bg-primary/20 transition-all hover:bg-primary/40"
                    style={{ height: `${height}%` }}
                  />
                ))}
              </div>
              <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                <span>00:00</span>
                <span>06:00</span>
                <span>12:00</span>
                <span>18:00</span>
                <span>23:59</span>
              </div>
            </CardContent>
          </Card>

          {/* Recent Runs */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Recent Runs</CardTitle>
              <Button variant="ghost" size="sm">
                View all
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {runs.map((run) => {
                  const agent = agents.find((a) => a.id === run.agent_id);
                  return (
                    <div
                      key={run.id}
                      className="flex items-center gap-3 rounded-lg bg-muted/50 p-3 transition-colors hover:bg-muted"
                    >
                      <div
                        className={`h-2 w-2 shrink-0 rounded-full ${
                          run.status === "success"
                            ? "bg-green-500"
                            : run.status === "running"
                            ? "bg-blue-500 animate-pulse"
                            : run.status === "error"
                            ? "bg-red-500"
                            : "bg-gray-500"
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {agent?.name || "Unknown Agent"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {timeAgo(run.started_at)} ·{" "}
                          {formatNumber(run.tokens_used ?? 0)} tokens
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {run.duration_ms
                          ? `${Math.round(run.duration_ms / 1000)}s`
                          : "..."}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Agent Status */}
        <Card>
          <CardHeader>
            <CardTitle>Agent Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {agents.slice(0, 4).map((agent) => (
                <div
                  key={agent.id}
                  className="flex items-center gap-3 rounded-lg border p-4 transition-colors hover:border-primary/50"
                >
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                    style={{ backgroundColor: `${agent.color}20` }}
                  >
                    <Bot className="h-5 w-5" style={{ color: agent.color }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{agent.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {agent.model}
                    </p>
                  </div>
                  <div className="text-right">
                    <p
                      className={`text-xs ${
                        agent.status === "active"
                          ? "text-green-500"
                          : "text-muted-foreground"
                      }`}
                    >
                      {agent.status === "active" ? "● Active" : "○ Idle"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatNumber(agent.run_count)} runs
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
