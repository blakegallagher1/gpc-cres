"use client";

import { type ComponentType, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Activity, Gauge, Timer, TrendingUp } from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const fetcher = async (url: string) => {
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) {
    const message = typeof data?.error === "string"
      ? data.error
      : "Failed to load entitlement KPI data";
    throw new Error(message);
  }
  return data;
};

type JurisdictionOption = {
  id: string;
  name: string;
};

type JurisdictionResponse = {
  jurisdictions: JurisdictionOption[];
};

type TrendPoint = {
  month: string;
  sampleSize: number;
  medianDecisionDays: number | null;
  medianTimelineAbsoluteErrorDays: number | null;
  approvalCalibrationGap: number | null;
};

type StrategyRow = {
  strategyKey: string;
  strategyLabel: string;
  sampleSize: number;
  medianTimelineAbsoluteErrorDays: number | null;
  approvalCalibrationGap: number | null;
};

type EntitlementKpiResponse = {
  sampleSize: number;
  matchedPredictionCount: number;
  medianDecisionDays: number | null;
  medianTimelineAbsoluteErrorDays: number | null;
  meanTimelineAbsoluteErrorDays: number | null;
  approvalCalibrationGap: number | null;
  trend?: TrendPoint[];
  byStrategy?: StrategyRow[];
};

function formatDays(value: number | null | undefined): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "-";
  return `${Math.round(value)}d`;
}

function formatSignedDecimal(value: number | null | undefined): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "-";
  const rounded = Math.round(value * 10000) / 10000;
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

function formatMonthLabel(isoMonth: string): string {
  const [yearText, monthText] = isoMonth.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (!year || !month) return isoMonth;
  const date = new Date(Date.UTC(year, month - 1, 1));
  return date.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
}

function Metric({
  title,
  value,
  icon: Icon,
  tone = "default",
}: {
  title: string;
  value: string;
  icon: ComponentType<{ className?: string }>;
  tone?: "default" | "good" | "warn" | "bad";
}) {
  const toneClass = tone === "good"
    ? "text-green-600 dark:text-green-400"
    : tone === "warn"
      ? "text-yellow-600 dark:text-yellow-400"
      : tone === "bad"
        ? "text-red-600 dark:text-red-400"
        : "text-muted-foreground";

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {title}
      </div>
      <p className={cn("mt-1 text-xl font-semibold", toneClass)}>{value}</p>
    </div>
  );
}

export function EntitlementKpiWidget() {
  const { data: jurisdictionData, isLoading: loadingJurisdictions } = useSWR<JurisdictionResponse>(
    "/api/jurisdictions",
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 300_000,
    },
  );

  const [jurisdictionId, setJurisdictionId] = useState<string>("");
  const jurisdictionOptions = jurisdictionData?.jurisdictions ?? [];

  useEffect(() => {
    if (jurisdictionId || jurisdictionOptions.length === 0) return;
    setJurisdictionId(jurisdictionOptions[0]?.id ?? "");
  }, [jurisdictionId, jurisdictionOptions]);

  const kpiUrl = jurisdictionId
    ? `/api/intelligence/entitlements?view=kpi&jurisdictionId=${jurisdictionId}&lookbackMonths=36&snapshotLookbackMonths=72&minSampleSize=1&recordLimit=1000`
    : null;

  const {
    data: kpi,
    isLoading: loadingKpis,
    error: kpiError,
  } = useSWR<EntitlementKpiResponse>(kpiUrl, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 120_000,
  });

  const trendData = useMemo(() => {
    const points = kpi?.trend ?? [];
    return points.map((point) => ({
      ...point,
      monthLabel: formatMonthLabel(point.month),
    }));
  }, [kpi?.trend]);

  const calibrationTone = (() => {
    const gap = Math.abs(kpi?.approvalCalibrationGap ?? 0);
    if (!kpi || kpi.approvalCalibrationGap === null) return "default";
    if (gap <= 0.05) return "good";
    if (gap <= 0.12) return "warn";
    return "bad";
  })();

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10">
              <Activity className="h-4 w-4 text-blue-500" />
            </div>
            <div>
              <CardTitle className="text-base">Entitlement KPI Monitor</CardTitle>
              <p className="text-xs text-muted-foreground">
                Median decision time, timeline MAE, and calibration drift
              </p>
            </div>
          </div>

          <div className="w-full md:w-[280px]">
            {loadingJurisdictions ? (
              <Skeleton className="h-9 w-full" />
            ) : (
              <Select value={jurisdictionId} onValueChange={setJurisdictionId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select jurisdiction" />
                </SelectTrigger>
                <SelectContent>
                  {jurisdictionOptions.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {!loadingJurisdictions && jurisdictionOptions.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No jurisdictions found. Add a jurisdiction to enable entitlement KPI monitoring.
          </p>
        )}

        {kpiError && (
          <p className="text-sm text-red-600 dark:text-red-400">
            {kpiError.message}
          </p>
        )}

        {loadingKpis ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-56 w-full" />
          </div>
        ) : kpi ? (
          <>
            <div className="grid gap-3 md:grid-cols-3">
              <Metric
                title="Median Entitlement Days"
                value={formatDays(kpi.medianDecisionDays)}
                icon={Timer}
              />
              <Metric
                title="Timeline MAE"
                value={formatDays(kpi.medianTimelineAbsoluteErrorDays)}
                icon={Gauge}
              />
              <Metric
                title="Calibration Gap"
                value={formatSignedDecimal(kpi.approvalCalibrationGap)}
                icon={TrendingUp}
                tone={calibrationTone}
              />
            </div>

            {trendData.length > 0 ? (
              <div className="rounded-lg border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-medium">Monthly Trend</p>
                  <Badge variant="secondary" className="text-xs">
                    {kpi.sampleSize} precedents
                  </Badge>
                </div>
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="monthLabel" />
                      <YAxis yAxisId="days" width={44} />
                      <YAxis yAxisId="gap" orientation="right" width={48} />
                      <Tooltip />
                      <Legend />
                      <Line
                        yAxisId="days"
                        type="monotone"
                        dataKey="medianDecisionDays"
                        name="Median Days"
                        stroke="#2563eb"
                        strokeWidth={2}
                        dot={false}
                        connectNulls
                      />
                      <Line
                        yAxisId="days"
                        type="monotone"
                        dataKey="medianTimelineAbsoluteErrorDays"
                        name="Timeline MAE"
                        stroke="#7c3aed"
                        strokeWidth={2}
                        dot={false}
                        connectNulls
                      />
                      <Line
                        yAxisId="gap"
                        type="monotone"
                        dataKey="approvalCalibrationGap"
                        name="Calibration Gap"
                        stroke="#dc2626"
                        strokeWidth={2}
                        dot={false}
                        connectNulls
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Not enough matched prediction history to plot KPI trend yet.
              </p>
            )}

            {(kpi.byStrategy ?? []).length > 0 && (
              <div className="rounded-lg border">
                <div className="border-b px-3 py-2">
                  <p className="text-sm font-medium">By Strategy</p>
                </div>
                <div className="divide-y">
                  {(kpi.byStrategy ?? []).slice(0, 6).map((row) => (
                    <div
                      key={row.strategyKey}
                      className="grid grid-cols-12 items-center gap-2 px-3 py-2 text-xs"
                    >
                      <div className="col-span-5 truncate font-medium">{row.strategyLabel}</div>
                      <div className="col-span-2 text-muted-foreground">n={row.sampleSize}</div>
                      <div className="col-span-3">{formatDays(row.medianTimelineAbsoluteErrorDays)}</div>
                      <div className="col-span-2">{formatSignedDecimal(row.approvalCalibrationGap)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
