"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { DealVelocityAnalytics } from "@/lib/services/portfolioAnalytics.service";

function trendBadge(trend: "faster" | "slower" | "flat"): string {
  if (trend === "faster") return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (trend === "slower") return "bg-red-100 text-red-700 border-red-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

export function DealVelocityMetrics({ data }: { data: DealVelocityAnalytics }) {
  const stageRows = data.stageDurations.filter((row) => row.sampleSize > 0);
  const killRows = data.killRateByStage.filter((row) => row.totalEntered > 0);
  const leakageRows = data.funnelLeakage.filter((row) => row.enteredCount > 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Stage Duration Metrics (avg / p50 / p75 / p90 days)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {stageRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No stage-duration samples yet.</p>
          ) : (
            stageRows.map((row) => (
              <div key={row.stage} className="grid grid-cols-2 gap-2 rounded border p-2 text-xs md:grid-cols-6">
                <div className="font-medium">{row.stage}</div>
                <div>avg {row.avgDays}</div>
                <div>p50 {row.medianDays}</div>
                <div>p75 {row.p75Days}</div>
                <div>p90 {row.p90Days}</div>
                <div className="text-muted-foreground">n={row.sampleSize}</div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Kill Rate by Stage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {killRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No kill-rate samples yet.</p>
            ) : (
              killRows.map((row) => (
                <div key={row.stage} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span>{row.stage}</span>
                    <span>{row.killRatePct.toFixed(1)}% ({row.killedCount}/{row.totalEntered})</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted">
                    <div className="h-1.5 rounded-full bg-red-500" style={{ width: `${Math.min(row.killRatePct, 100)}%` }} />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Funnel Leakage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {leakageRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No funnel leakage samples yet.</p>
            ) : (
              leakageRows.map((row) => (
                <div key={row.stage} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span>{row.stage} → {row.nextStage ?? "N/A"}</span>
                    <span>{row.dropOffPct.toFixed(1)}% drop ({row.droppedCount}/{row.enteredCount})</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted">
                    <div className="h-1.5 rounded-full bg-amber-500" style={{ width: `${Math.min(row.dropOffPct, 100)}%` }} />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Quarter-over-Quarter Velocity Trend</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.quarterOverQuarter.length === 0 ? (
            <p className="text-sm text-muted-foreground">No quarterly trend data yet.</p>
          ) : (
            data.quarterOverQuarter.map((row) => (
              <div key={row.quarter} className="grid grid-cols-2 gap-2 rounded border p-2 text-xs md:grid-cols-6">
                <div className="font-medium">{row.quarter}</div>
                <div>avg {row.avgDays}</div>
                <div>p50 {row.medianDays}</div>
                <div>p75 {row.p75Days}</div>
                <div>p90 {row.p90Days}</div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={trendBadge(row.trend)}>
                    {row.trend}
                  </Badge>
                  <span className="text-muted-foreground">n={row.sampleSize}</span>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

