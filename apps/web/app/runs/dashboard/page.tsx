"use client";

import Link from "next/link";
import { useMemo, useCallback, useState } from "react";
import {
  RefreshCw,
  ArrowUpRight,
  Brain,
  CheckCircle2,
  AlertTriangle,
  LineChart,
  ShieldCheck,
  ListTodo,
  Loader2,
  Download,
} from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatDuration, formatNumber } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  type RunDashboardPayload,
  type RunDashboardRecentRun,
  type RunDashboardReproducibilityAlert,
  type RunDashboardSourceIngestionOffender,
  type RunDashboardSourceIngestionProfile,
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

interface RunPerformancePoint {
  id: string;
  label: string;
  date: string;
  durationMs: number;
  status: string;
  runType: string;
}

interface RunReliabilityPoint {
  date: string;
  total: number;
  successCount: number;
}

function formatRunPerformanceLabel(dateInput: string) {
  const date = new Date(dateInput);
  return Number.isNaN(date.getTime())
    ? "—"
    : `${date.getMonth() + 1}/${date.getDate()}`;
}

function buildRunPerformanceTrend(runs: RunDashboardRecentRun[]) {
  const points = runs
    .filter((run) => run.durationMs !== null && run.startedAt != null)
    .map((run) => ({
      id: run.id,
      label: formatRunPerformanceLabel(run.startedAt),
      date: run.startedAt,
      durationMs: run.durationMs ?? 0,
      status: run.status,
      runType: run.runType,
    }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(-12);

  return points;
}

function buildRunReliabilityTrend(runs: RunDashboardRecentRun[]) {
  const now = new Date();
  const buckets = new Map<string, { date: string; total: number; successCount: number }>();

  for (let i = 6; i >= 0; i -= 1) {
    const bucketDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = bucketDate.toLocaleDateString("en-CA");
    buckets.set(key, {
      date: bucketDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      total: 0,
      successCount: 0,
    });
  }

  for (const run of runs) {
    if (!run.startedAt) continue;
    const started = new Date(run.startedAt);
    if (Number.isNaN(started.getTime())) continue;
    const key = new Date(started.getFullYear(), started.getMonth(), started.getDate()).toLocaleDateString("en-CA");
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.total += 1;
    if (run.status === "succeeded") {
      bucket.successCount += 1;
    }
  }

  return Array.from(buckets.values()).map((bucket) => ({
    date: bucket.date,
    total: bucket.total,
    successCount: bucket.successCount,
  }));
}

function RunPerformanceTimeline({
  points,
}: {
  points: RunPerformancePoint[];
}) {
  if (points.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Run duration trend (recent runs)</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          No completed runs with duration telemetry yet.
        </CardContent>
      </Card>
    );
  }

  const maxDuration = Math.max(...points.map((point) => point.durationMs), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Run duration trend (recent runs)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {points.map((point) => (
          <div key={point.id} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-mono text-[11px] text-muted-foreground">
                {point.label} · {point.runType}
              </span>
              <span className="text-muted-foreground">{formatDuration(point.durationMs)}</span>
            </div>
            <div className="h-2 rounded-full bg-muted">
              <div
                className={cn(
                  "h-2 rounded-full transition-all",
                  point.status === "succeeded"
                    ? "bg-emerald-500"
                    : point.status === "failed"
                      ? "bg-red-500"
                      : "bg-blue-500"
                )}
                style={{ width: `${(point.durationMs / maxDuration) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function RunReliabilityTrend({
  points,
}: {
  points: RunReliabilityPoint[];
}) {
  if (points.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Run success trend (7 days)</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          No run history available yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Run success trend (7 days)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {points.map((point) => {
          const successRate =
            point.total > 0 ? (point.successCount / point.total) * 100 : 0;
          return (
            <div key={`${point.date}-${point.successCount}`} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{point.date}</span>
                <span>{point.successCount}/{point.total}</span>
              </div>
              <div className="h-2 rounded-full bg-muted">
                <div
                  className="h-2 rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${successRate}%` }}
                />
              </div>
            </div>
          );
        })}
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

function SourceIngestionOffendersSection({
  offenders,
}: {
  offenders: RunDashboardSourceIngestionOffender[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Source-ingest stale offender samples</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {offenders.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No stale-offender samples from recent source-ingest runs.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>URL</TableHead>
                <TableHead>Run</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Age</TableHead>
                <TableHead>Signals</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {offenders.map((offender) => (
                <TableRow key={`${offender.runId}-${offender.url}`}>
                  <TableCell className="text-sm">
                    <div className="font-medium">{offender.url}</div>
                    <div className="text-xs text-muted-foreground">
                      {offender.jurisdictionName}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    <Link href={`/runs/${offender.runId}`}>{abbreviateId(offender.runId)}</Link>
                  </TableCell>
                  <TableCell className="text-xs">
                    <Badge
                      variant={offender.priority === "critical" ? "destructive" : "outline"}
                    >
                      {offender.priority}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    {offender.stalenessDays === null
                      ? "never refreshed"
                      : `${offender.stalenessDays}d stale`}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {offender.alertReasons.slice(0, 2).join("; ") || "No reason"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function SourceManifestContinuitySection({
  profile,
}: {
  profile: RunDashboardSourceIngestionProfile;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Source manifest continuity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-sm">
          {profile.manifestContinuityComparisons === 0 ? (
            <p className="text-muted-foreground">No source manifest continuity comparisons yet.</p>
          ) : (
            <p>
              {profile.manifestContinuityDrifts} / {profile.manifestContinuityComparisons} manifest
              continuity comparisons drifted
              <span className="text-muted-foreground">
                {" "}
                ({formatPercent(profile.manifestContinuityDriftRate)} rate).
              </span>
            </p>
          )}
        </div>
        {profile.recentManifestContinuityAlerts.length > 0 ? (
          <ul className="space-y-2 text-xs">
            {profile.recentManifestContinuityAlerts.map((alert) => (
              <li
                key={`${alert.fromRunId}-${alert.toRunId}`}
                className="rounded border p-2"
              >
                <div className="font-mono">
                  {abbreviateId(alert.fromRunId)} → {abbreviateId(alert.toRunId)}
                </div>
                <div className="text-muted-foreground">
                  {alert.runType}: {alert.previousManifestHash.slice(0, 12)} →{" "}
                  {alert.currentManifestHash.slice(0, 12)}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No recent manifest drift alerts.</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function RunDashboardPage() {
  const { dashboard, isLoading, isError, mutate } = useRunDashboard({
    runLimit: 500,
    refreshIntervalMs: 30000,
  });
  const [isExporting, setIsExporting] = useState(false);

  const handleExportRunHistory = useCallback(() => {
    if (isExporting || !dashboard) return;

    setIsExporting(true);

    try {
      const escapeCsvCell = (value: string) =>
        `"${value.replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;

      const runHeaders = [
        "runId",
        "runType",
        "status",
        "confidence",
        "startedAt",
        "finishedAt",
        "durationMs",
        "evidenceCount",
        "missingEvidenceCount",
        "proofChecksCount",
        "retryAttempts",
        "retryMode",
        "fallbackTriggered",
        "fallbackReason",
        "toolFailureCount",
        "correlationId",
        "openaiResponseId",
        "retryPolicyReason",
        "retryPolicyAttempts",
        "retryPolicyMaxAttempts",
        "retryPolicyShouldRetry",
        "lastAgentName",
      ];

      const runRows = dashboard.recentRuns.map((run) => [
        run.id,
        run.runType,
        run.status,
        run.confidence === null ? "" : String(run.confidence),
        run.startedAt,
        run.finishedAt ?? "",
        run.durationMs === null ? "" : String(run.durationMs),
        String(run.evidenceCount),
        String(run.missingEvidenceCount),
        String(run.proofChecksCount),
        String(run.retryAttempts),
        run.retryMode ?? "",
        String(run.fallbackTriggered),
        run.fallbackReason ?? "",
        String(run.toolFailureCount),
        run.correlationId ?? "",
        run.openaiResponseId ?? "",
        run.retryPolicyReason ?? "",
        run.retryPolicyAttempts === null ? "" : String(run.retryPolicyAttempts),
        run.retryPolicyMaxAttempts === null ? "" : String(run.retryPolicyMaxAttempts),
        String(run.retryPolicyShouldRetry ?? ""),
        run.lastAgentName ?? "",
      ]);

      const metricRows = [
        ["metric", "value"],
        ["generatedAt", dashboard.generatedAt],
        ["totalRuns", String(dashboard.totals.totalRuns)],
        ["succeededRuns", String(dashboard.totals.succeededRuns)],
        ["failedRuns", String(dashboard.totals.failedRuns)],
        ["runningRuns", String(dashboard.totals.runningRuns)],
        ["canceledRuns", String(dashboard.totals.canceledRuns)],
        ["averageConfidence", String(dashboard.totals.averageConfidence ?? "")],
        ["evidenceCitations", String(dashboard.totals.evidenceCitations)],
        ["evidenceSourcesCited", String(dashboard.totals.evidenceSourcesCited)],
        ["evidenceSourcesWithAlerts", String(dashboard.totals.evidenceSourcesWithAlerts)],
        ["runsWithRetry", String(dashboard.totals.runsWithRetry)],
        ["runsWithRetryPolicy", String(dashboard.totals.runsWithRetryPolicy)],
        ["runsWithFallback", String(dashboard.totals.runsWithFallback)],
        ["runsWithMissingEvidence", String(dashboard.totals.runsWithMissingEvidence)],
      ];

      const confidenceRows = [
        ["date", "runCount", "averageConfidence"],
        ...dashboard.confidenceTimeline.map((point) => [
          point.date,
          String(point.runCount),
          String(point.averageConfidence ?? ""),
        ]),
      ];

      const csv = [
        "# Run history",
        runHeaders.map(escapeCsvCell).join(","),
        ...runRows.map((row) => row.map((cell) => escapeCsvCell(cell)).join(",")),
        "",
        "# Run dashboard totals",
        ...metricRows.map((row) => row.map((cell) => escapeCsvCell(cell)).join(",")),
        "",
        "# Confidence timeline",
        ...confidenceRows.map((row) => row.map((cell) => escapeCsvCell(cell)).join(",")),
      ].join("\n");

      const blob = new Blob([`\uFEFF${csv}`], {
        type: "text/csv;charset=utf-8;",
      });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute(
        "download",
        `run-dashboard-export-${new Date().toISOString().slice(0, 10)}.csv`
      );
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success(
        `Exported run history (${dashboard.recentRuns.length} recent runs).`
      );
    } catch {
      toast.error("Failed to export run history.");
    } finally {
      setIsExporting(false);
    }
  }, [dashboard, isExporting]);

  const totalsCards = useMemo(() => {
    const totals = dashboard?.totals;
    const sourceIngestionProfile = dashboard?.sourceIngestionProfile;

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
      {
        title: "Source manifest continuity",
        value: sourceIngestionProfile
          ? `${sourceIngestionProfile.manifestContinuityDrifts}/${sourceIngestionProfile.manifestContinuityComparisons}`
          : "0/0",
        detail: sourceIngestionProfile
          ? `Manifest drift ${formatPercent(sourceIngestionProfile.manifestContinuityDriftRate)}`
          : "No manifest comparisons",
        icon: <ShieldCheck className="h-4 w-4" />,
      },
      {
        title: "Stale offender samples",
        value: formatNumber(sourceIngestionProfile?.topStaleOffenders.length ?? 0),
        detail: sourceIngestionProfile?.topStaleOffenders.length
          ? "Tracked from recent runs"
          : "No tracked offenders",
        icon: <ListTodo className="h-4 w-4" />,
      },
    ];
  }, [dashboard?.sourceIngestionProfile, dashboard?.totals]);

  const performanceTrend = useMemo(
    () => (dashboard ? buildRunPerformanceTrend(dashboard.recentRuns) : []),
    [dashboard]
  );
  const reliabilityTrend = useMemo(
    () => (dashboard ? buildRunReliabilityTrend(dashboard.recentRuns) : []),
    [dashboard]
  );

  if (isLoading || !dashboard) {
    return (
      <DashboardShell>
        <div className="space-y-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>
              Loading run intelligence metrics (typically under 20 seconds on first render).
            </span>
          </div>
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <Skeleton className="h-7 w-80" />
              <Skeleton className="h-4 w-64" />
            </div>
            <Skeleton className="h-8 w-24" />
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 12 }).map((_, index) => (
              <Card key={`run-metric-skeleton-${index}`}>
                <CardHeader className="pb-2">
                  <Skeleton className="h-4 w-28" />
                </CardHeader>
                <CardContent className="space-y-2">
                  <Skeleton className="h-8 w-20" />
                  <Skeleton className="h-3 w-44" />
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <Skeleton className="h-4 w-40" />
              </CardHeader>
              <CardContent className="space-y-2">
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <Skeleton className="h-4 w-40" />
              </CardHeader>
              <CardContent className="space-y-2">
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <Skeleton className="h-4 w-52" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-48" />
            </CardContent>
          </Card>
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
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => mutate()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportRunHistory}
              disabled={isExporting}
              aria-label="Export run history to CSV"
            >
              <Download className="mr-2 h-4 w-4" />
              {isExporting ? "Exporting..." : "Export"}
            </Button>
          </div>
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
            <RunPerformanceTimeline points={performanceTrend} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <RunReliabilityTrend points={reliabilityTrend} />
            <DistributionList
              title="Run types"
              items={dashboard.runTypeDistribution}
              total={dashboard.totals.totalRuns}
              valueLabel="run type"
            />
          </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <SourceIngestionOffendersSection
            offenders={dashboard.sourceIngestionProfile.topStaleOffenders}
          />
          <SourceManifestContinuitySection
            profile={dashboard.sourceIngestionProfile}
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
