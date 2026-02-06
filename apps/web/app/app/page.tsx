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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
            ? {
                ...run,
                status: "success",
                duration_ms: Math.floor(Math.random() * 200000),
              }
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
  const { isRefreshing, lastRefresh, refresh } = useAutoRefresh(
    fetchDashboardData,
    30000
  );

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
          variant="outline"
          size="sm"
          onClick={refresh}
          disabled={isRefreshing}
          className="gap-2"
        >
          <RefreshCw className={isRefreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          {isRefreshing ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Runs (24h)"
          value={formatNumber(statsData.totalRuns24h)}
          subtitle="Total agent runs"
          change={statsData.totalRunsChange}
          icon={Activity}
        />
        <StatCard
          title="Active Agents"
          value={`${statsData.activeAgents}/${statsData.totalAgents}`}
          subtitle="Available agents"
          icon={Bot}
        />
        <StatCard
          title="Avg Latency"
          value={`${Math.round(statsData.avgLatency)}ms`}
          subtitle="Response time"
          change={statsData.avgLatencyChange}
          icon={Clock}
        />
        <StatCard
          title="Token Usage"
          value={formatNumber(statsData.tokenUsage24h)}
          subtitle={`${formatCurrency(statsData.estimatedCost)} estimated cost`}
          change={statsData.tokenUsageChange}
          icon={Coins}
        />
      </div>

      {/* Recent Activity */}
      <div className="mt-6 grid gap-4 lg:grid-cols-7">
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle>Recent Runs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {runs?.slice(0, 5).map((run) => (
                <div key={run.id} className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium leading-none">{run.agent_id}</p>
                    <p className="text-xs text-muted-foreground">
                      {timeAgo(run.started_at)}
                    </p>
                  </div>
                  <Badge
                    variant={
                      run.status === "success"
                        ? "default"
                        : run.status === "error"
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {run.status}
                  </Badge>
                </div>
              ))}
              {!runs?.length && (
                <p className="text-sm text-muted-foreground">No recent runs yet.</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>System Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="h-[200px] w-full">
                <div className="flex h-full items-end gap-1">
                  {activityData.map((value, index) => (
                    <div
                      key={index}
                      className="w-full rounded-sm bg-primary/20"
                      style={{ height: `${value}%` }}
                    />
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">Agents Online</p>
                <p className="text-xs text-muted-foreground">
                  {agents?.length ?? 0} agents registered
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}

