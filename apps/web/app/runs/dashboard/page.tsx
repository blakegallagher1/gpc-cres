"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  RefreshCw,
  ArrowUpRight,
  Brain,
  CheckCircle2,
  AlertTriangle,
  LineChart,
} from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatDuration, formatNumber } from "@/lib/utils";
import {
  type RunDashboardPayload,
  type RunDashboardRecentRun,
  type RunDashboardReproducibilityAlert,
  useRunDashboard,
} from "@/lib/hooks/useRunDashboard";

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatPercent(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${Math.round(value * 100)}%` : "—";
}

function abbreviateId(value: string) {
  return value.length > 8 ? `${value.slice(0, 8)}…` : value;
}

function statusBadgeVariant(status: string) {
  if (status === "succeeded") return "default";
  if (status === "failed") return "destructive";
  if (status === "running") return "secondary";
  return "outline";
}

function StatCard({
  title,
  value,
  detail,
  icon,
}: {
  title: string;
  value: string;
  detail?: string;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <span className="text-muted-foreground">{icon}</span>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {detail ? <div className="text-xs text-muted-foreground">{detail}</div> : null}
      </CardContent>
    </Card>
  );
}

function ConfidenceTimeline({
  timeline,
}: {
  timeline: RunDashboardPayload["confidenceTimeline"];
}) {
  if (timeline.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Confidence trend (recent runs)</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          No completed confidence data in the sampled window.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Confidence trend (recent runs)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {timeline.map((point) => (
          <div key={point.date} className="space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{point.date}</span>
              <span>{point.runCount} runs</span>
            </div>
            <div className="h-2 rounded bg-muted">
              <div
                className="h-2 rounded bg-emerald-500 transition-all"
                style={{
                  width:
                    point.averageConfidence !== null
                      ? `${Math.max(Math.round(point.averageConfidence * 100), 1)}%`
                      : "0%",
                }}
              />
            </div>
            <div className="text-xs text-muted-foreground">
              {formatPercent(point.averageConfidence)}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function RecentRunsSection({ runs }: { runs: RunDashboardRecentRun[] }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Recent runs (sample)</CardTitle>
        <Link href="/runs" className="text-sm text-muted-foreground hover:underline">
          Open full run list →
        </Link>
      </CardHeader>
      <CardContent className="overflow-auto">
        {runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No run records yet.</p>
        ) : (
          <Table>
            <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Run</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Retries</TableHead>
                  <TableHead>Warnings</TableHead>
                  <TableHead>Trace IDs</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Fallback</TableHead>
                </TableRow>
              </TableHeader>
            <TableBody>
              {runs.map((run) => {
                const warningCount = [
                  run.toolFailureCount > 0 ? `${run.toolFailureCount} tool failure(s)` : null,
                  run.missingEvidenceCount > 0
                    ? `${run.missingEvidenceCount} missing evidence item(s)`
                    : null,
                  run.proofChecksCount > 0 ? `${run.proofChecksCount} proof checks` : null,
                  run.retryPolicyReason
                    ? `${run.retryPolicyReason} ${run.retryPolicyAttempts !== null ? `(${run.retryPolicyAttempts}/${run.retryPolicyMaxAttempts ?? "?"})` : ""}`
                    : null,
                ].filter(Boolean);

                return (
                  <TableRow key={run.id}>
                    <TableCell className="font-mono text-xs">
                      <Link
                        href={`/runs/${run.id}`}
                        className="text-blue-600 hover:underline"
                      >
                        {run.id}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">{run.runType}</TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeVariant(run.status)}>{run.status}</Badge>
                    </TableCell>
                    <TableCell>{formatPercent(run.confidence)}</TableCell>
                    <TableCell>{run.retryAttempts}</TableCell>
                    <TableCell>
                      {warningCount.length > 0 ? (
                        <ul className="text-xs text-muted-foreground">
                          {warningCount.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      <div className="space-y-1">
                        {run.correlationId ? (
                          <div>corr {abbreviateId(run.correlationId)}</div>
                        ) : null}
                        {run.openaiResponseId ? (
                          <div>openai {abbreviateId(run.openaiResponseId)}</div>
                        ) : null}
                        {run.retryPolicyShouldRetry ? (
                          <div className="text-amber-500">retry continuation queued</div>
                        ) : null}
                        {run.retryPolicyReason && !run.retryPolicyShouldRetry ? (
                          <div>policy: {run.retryPolicyReason}</div>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(run.startedAt)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {run.fallbackTriggered ? (
                        <span className="text-amber-500">Fallbacked</span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function DistributionList({
  title,
  items,
  total,
  valueLabel,
}: {
  title: string;
  items: { key: string; count: number }[];
  total: number;
  valueLabel: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No {valueLabel} recorded yet.</p>
        ) : (
          items.map((item) => {
            const pct =
              total > 0 ? Math.round((item.count / total) * 100) : 0;
            return (
              <div key={item.key} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-mono text-xs">{item.key}</span>
                  <span className="text-muted-foreground">
                    {item.count} ({pct}%)
                  </span>
                </div>
                <div className="h-2 rounded bg-muted">
                  <div
                    className="h-2 rounded bg-blue-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

function ReproducibilityPanel({
  alerts,
  totalComparisons,
  totalDrifts,
  driftRate,
  topRunTypes,
}: {
  alerts: RunDashboardReproducibilityAlert[];
  totalComparisons: number;
  totalDrifts: number;
  driftRate: number | null;
  topRunTypes: Array<{ key: string; count: number }>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Reproducibility drift (hash continuity)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-sm">
          {totalComparisons === 0 ? (
            <p className="text-muted-foreground">No hash continuity comparisons yet.</p>
          ) : (
            <p>
              {totalDrifts} / {totalComparisons} comparisons drifted
              <span className="text-muted-foreground"> ({formatPercent(driftRate)} rate).</span>
            </p>
          )}
        </div>
        {topRunTypes.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">Drift concentration</p>
            {topRunTypes.map((item) => (
              <div key={item.key} className="flex items-center justify-between text-xs">
                <span className="font-mono">{item.key}</span>
                <span className="text-muted-foreground">{item.count} drift(s)</span>
              </div>
            ))}
          </div>
        ) : null}
        {alerts.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">Recent drifts</p>
            <ul className="space-y-2 text-xs text-muted-foreground">
              {alerts.map((alert) => (
                <li key={`${alert.fromRunId}-${alert.toRunId}`} className="rounded border p-2">
                  <div className="font-mono text-foreground">
                    {abbreviateId(alert.fromRunId)} → {abbreviateId(alert.toRunId)}
                  </div>
                  <div>
                    {alert.runType} / {alert.hashType}
                  </div>
                  <div className="font-mono break-all">
                    {alert.previousHash.slice(0, 12)} → {alert.currentHash.slice(0, 12)}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function RunDashboardPage() {
  const { dashboard, isLoading, isError, mutate } = useRunDashboard({
    runLimit: 500,
    refreshIntervalMs: 30000,
  });

  const totalsCards = useMemo(() => {
    const totals = dashboard?.totals;

    if (!totals) {
      return [];
    }

    return [
      {
        title: "Total runs",
        value: formatNumber(totals.totalRuns),
        icon: <Brain className="h-4 w-4" />,
      },
      {
        title: "Success / Failure",
        value: `${totals.succeededRuns}/${totals.failedRuns}`,
        detail: `${percent(
          totals.totalRuns > 0 ? totals.succeededRuns / totals.totalRuns : 0,
        )} success`,
        icon: <CheckCircle2 className="h-4 w-4" />,
      },
      {
        title: "Avg confidence",
        value: formatPercent(totals.averageConfidence),
        detail: `${totals.confidenceSamples} sampled runs`,
        icon: <LineChart className="h-4 w-4" />,
      },
      {
        title: "Evidence citations",
        value: formatNumber(totals.evidenceCitations),
        detail: `${totals.evidenceSnapshotsCited} snapshots · ${totals.evidenceSourcesCited} sources`,
        icon: <CheckCircle2 className="h-4 w-4" />,
      },
      {
        title: "Evidence freshness",
        value: formatPercent(totals.evidenceAverageFreshnessScore),
        detail: `${totals.evidenceSourcesWithAlerts} source(s) with active alerts`,
        icon: <AlertTriangle className="h-4 w-4" />,
      },
      {
        title: "Evidence alerts",
        value: `${totals.evidenceCriticalAlertSources}/${totals.evidenceSourcesWithAlerts}`,
        detail: `Critical / warning with continuity drift: ${totals.evidenceWarningAlertSources}`,
        icon: <AlertTriangle className="h-4 w-4" />,
      },
      {
        title: "Retry runs",
        value: formatNumber(totals.runsWithRetry),
        detail: `Total attempts: ${totals.retryAttempts}`,
        icon: <ArrowUpRight className="h-4 w-4" />,
      },
      {
        title: "Retry policy runs",
        value: formatNumber(totals.runsWithRetryPolicy),
        detail: `${totals.runsWithRetryPolicy > 0 ? `${totals.runsWithRetryPolicyTriggers} continuation triggers` : "No continuation triggers"}`,
        icon: <AlertTriangle className="h-4 w-4" />,
      },
      {
        title: "Fallback runs",
        value: formatNumber(totals.runsWithFallback),
        detail: `Tool failures: ${totals.toolFailureEvents}`,
        icon: <AlertTriangle className="h-4 w-4" />,
      },
      {
        title: "Missing-evidence runs",
        value: formatNumber(totals.runsWithMissingEvidence),
        detail: `Avg missing items: ${totals.avgMissingEvidenceCount}`,
        icon: <AlertTriangle className="h-4 w-4" />,
      },
      {
        title: "Reproducibility drift",
        value: formatNumber(totals.reproducibilityDrifts),
        detail: `${formatPercent(totals.reproducibilityDriftRate)} drift rate`,
        icon: <AlertTriangle className="h-4 w-4" />,
      },
    ];
  }, [dashboard?.totals]);

  if (isLoading || !dashboard) {
    return (
      <DashboardShell>
        <div className="space-y-6">
          <h1 className="text-2xl font-bold">Run Intelligence Dashboard</h1>
          <p className="text-muted-foreground">Loading run intelligence metrics...</p>
        </div>
      </DashboardShell>
    );
  }

  if (isError) {
    return (
      <DashboardShell>
        <div className="space-y-4">
          <h1 className="text-2xl font-bold">Run Intelligence Dashboard</h1>
          <p className="text-destructive">
            Could not load run metrics. Try again later.
          </p>
          <Button onClick={() => mutate()}>Retry</Button>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Run Intelligence Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Agent state, confidence, retries, and proof metrics across recent runs.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => mutate()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {totalsCards.map((card) => (
              <StatCard
                key={`${card.title}-${card.value}`}
                title={card.title}
                value={card.value}
                detail={card.detail}
                icon={card.icon}
              />
            ))}
          </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <DistributionList
            title="Evidence freshness by state"
            items={dashboard.evidenceProfile.freshnessStateDistribution}
            total={dashboard.totals.evidenceSourcesCited || 1}
            valueLabel="evidence source state"
          />
          <DistributionList
            title="Evidence alert reasons"
            items={dashboard.evidenceProfile.alertReasonDistribution}
            total={dashboard.totals.evidenceSourcesWithAlerts || 1}
            valueLabel="alert reason"
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <ConfidenceTimeline timeline={dashboard.confidenceTimeline} />
          <DistributionList
            title="Run types"
            items={dashboard.runTypeDistribution}
            total={dashboard.totals.totalRuns}
            valueLabel="run type"
          />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <DistributionList
            title="Reproducibility drift by run type"
            items={dashboard.reproducibilityProfile.topDriftRunTypes}
            total={dashboard.totals.reproducibilityDrifts || 1}
            valueLabel="run type"
          />
          <ReproducibilityPanel
            alerts={dashboard.reproducibilityProfile.recentDriftAlerts}
            totalComparisons={dashboard.totals.reproducibilityComparisons}
            totalDrifts={dashboard.totals.reproducibilityDrifts}
            driftRate={dashboard.totals.reproducibilityDriftRate}
            topRunTypes={dashboard.reproducibilityProfile.topDriftRunTypes}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-4">
          <DistributionList
            title="Retry mode"
            items={dashboard.retryProfile.retryModeDistribution}
            total={dashboard.totals.runsWithRetry || 1}
            valueLabel="retry mode"
          />
          <DistributionList
            title="Retry policy reasons"
            items={dashboard.retryProfile.retryPolicyReasonDistribution}
            total={dashboard.totals.runsWithRetryPolicy || 1}
            valueLabel="retry policy reason"
          />
          <DistributionList
            title="Missing-evidence patterns"
            items={dashboard.missingEvidenceProfile.topMissingEvidence}
            total={dashboard.totals.runsWithMissingEvidence || 1}
            valueLabel="missing-evidence item"
          />
          <DistributionList
            title="Top tool failures"
            items={dashboard.toolFailureProfile.topToolFailureReasons}
            total={dashboard.totals.runsWithToolFailures || 1}
            valueLabel="tool failure"
          />
        </div>

        <RecentRunsSection runs={dashboard.recentRuns} />
      </div>
    </DashboardShell>
  );
}
