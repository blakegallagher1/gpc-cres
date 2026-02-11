"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ConcentrationAnalysis, ConcentrationBucket } from "@/lib/services/portfolioAnalytics.service";

const COLORS = [
  "#6366f1", "#3b82f6", "#22c55e", "#f59e0b", "#ef4444",
  "#8b5cf6", "#06b6d4", "#ec4899", "#14b8a6", "#f97316",
];

function BarChart({
  title,
  data,
}: {
  title: string;
  data: ConcentrationBucket[];
}) {
  const maxPct = Math.max(...data.map((d) => d.pct), 1);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">
            No data
          </p>
        ) : (
          <div className="space-y-2">
            {data.map((bucket, i) => (
              <div key={bucket.name} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium">{bucket.name}</span>
                  <span className="text-muted-foreground">
                    {bucket.count} deals ({bucket.pct}%)
                  </span>
                </div>
                <div className="h-5 w-full rounded-sm bg-muted">
                  <div
                    className="h-full rounded-sm transition-all"
                    style={{
                      width: `${(bucket.pct / maxPct) * 100}%`,
                      backgroundColor: COLORS[i % COLORS.length],
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ConcentrationCharts({
  data,
}: {
  data: ConcentrationAnalysis;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <BarChart title="Geographic Concentration" data={data.geographic} />
      <BarChart title="SKU Concentration" data={data.sku} />
      <BarChart title="Vintage Year" data={data.vintageYear} />
      <BarChart title="Risk Tier" data={data.riskTier} />
    </div>
  );
}
