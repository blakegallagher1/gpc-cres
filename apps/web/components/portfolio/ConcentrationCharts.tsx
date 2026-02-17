"use client";

import { AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type {
  ConcentrationAnalysis,
  ConcentrationBucket,
} from "@/lib/services/portfolioAnalytics.service";

function bandStyles(band: "green" | "yellow" | "red") {
  if (band === "red") {
    return {
      ring: "#ef4444",
      text: "text-red-600",
      badge: "bg-red-100 text-red-700 border-red-200",
    };
  }
  if (band === "yellow") {
    return {
      ring: "#f59e0b",
      text: "text-amber-600",
      badge: "bg-amber-100 text-amber-700 border-amber-200",
    };
  }
  return {
    ring: "#22c55e",
    text: "text-emerald-600",
    badge: "bg-emerald-100 text-emerald-700 border-emerald-200",
  };
}

function formatHhi(value: number): string {
  return value.toFixed(3);
}

function GaugeCard({
  title,
  hhi,
  band,
  top3,
}: {
  title: string;
  hhi: number;
  band: "green" | "yellow" | "red";
  top3: ConcentrationBucket[];
}) {
  const styles = bandStyles(band);
  const normalized = Math.max(0, Math.min(1, hhi));
  const degrees = Math.round(normalized * 360);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-4">
          <div
            className="relative h-20 w-20 rounded-full"
            style={{
              background: `conic-gradient(${styles.ring} ${degrees}deg, #e5e7eb ${degrees}deg 360deg)`,
            }}
          >
            <div className="absolute inset-[8px] flex items-center justify-center rounded-full bg-background text-[11px] font-semibold">
              {formatHhi(hhi)}
            </div>
          </div>
          <div className="space-y-1 text-xs">
            <p className="text-muted-foreground">HHI Thresholds</p>
            <p>Green: &lt; 0.25</p>
            <p>Yellow: 0.25 - 0.50</p>
            <p>Red: &gt; 0.50</p>
            <Badge variant="outline" className={styles.badge}>
              {band.toUpperCase()}
            </Badge>
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium">Top-3 Exposure</p>
          {top3.length === 0 ? (
            <p className="text-xs text-muted-foreground">No data</p>
          ) : (
            top3.map((bucket) => (
              <div key={bucket.name} className="flex items-center justify-between text-xs">
                <span className="truncate">{bucket.name}</span>
                <span className={styles.text}>
                  {bucket.pct}% ({bucket.count})
                </span>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function BarList({ title, data }: { title: string; data: ConcentrationBucket[] }) {
  const max = Math.max(...data.map((row) => row.pct), 1);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {data.length === 0 ? (
          <p className="text-xs text-muted-foreground">No data</p>
        ) : (
          data.slice(0, 6).map((row) => (
            <div key={row.name} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span>{row.name}</span>
                <span className="text-muted-foreground">{row.pct}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted">
                <div
                  className="h-1.5 rounded-full bg-primary"
                  style={{ width: `${(row.pct / max) * 100}%` }}
                />
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

export function ConcentrationCharts({ data }: { data: ConcentrationAnalysis }) {
  return (
    <div className="space-y-4">
      {data.hhi.hasAlert ? (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4" />
          Concentration alert: at least one HHI dimension is above 0.50.
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <GaugeCard
          title="HHI by Parish"
          hhi={data.hhi.parish.value}
          band={data.hhi.parish.band}
          top3={data.hhi.parish.top3}
        />
        <GaugeCard
          title="HHI by SKU"
          hhi={data.hhi.sku.value}
          band={data.hhi.sku.band}
          top3={data.hhi.sku.top3}
        />
        <GaugeCard
          title="HHI by Lender"
          hhi={data.hhi.lender.value}
          band={data.hhi.lender.band}
          top3={data.hhi.lender.top3}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <BarList title="Geographic Exposure" data={data.geographic} />
        <BarList title="Lender Exposure" data={data.lender} />
      </div>
    </div>
  );
}
