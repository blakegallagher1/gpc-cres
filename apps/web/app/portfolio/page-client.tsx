"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  Download,
  LayoutGrid,
  Map as MapIcon,
  TrendingUp,
  Target,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  Loader2,
  DollarSign,
  BarChart3,
  TrendingDown,
  CheckCircle2,
  XCircle,
  Minus,
  Clock,
} from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MetricCard } from "@/components/portfolio/MetricCard";
import { PipelineFunnel } from "@/components/portfolio/PipelineFunnel";
import { SkuDonut, JurisdictionBar } from "@/components/portfolio/DealVelocityChart";
import { ConcentrationCharts } from "@/components/portfolio/ConcentrationCharts";
import { DebtMaturityWall } from "@/components/portfolio/DebtMaturityWall";
import { CapitalAllocationWidget } from "@/components/portfolio/CapitalAllocationWidget";
import { DealVelocityMetrics } from "@/components/portfolio/DealVelocityMetrics";
import { CapitalDeploymentTracker } from "@/components/portfolio/CapitalDeploymentTracker";
import { Exchange1031Matcher } from "@/components/portfolio/Exchange1031Matcher";
import { StressTestPanel } from "@/components/portfolio/StressTestPanel";
import {
  type PortfolioDeal,
  SKU_CONFIG,
  PIPELINE_STAGES,
  type SkuType,
} from "@/lib/data/portfolioConstants";
import type {
  PortfolioSummary,
  ConcentrationAnalysis,
  DebtMaturityWall as DebtMaturityWallData,
  DealVelocityAnalytics,
  CapitalDeploymentAnalytics,
} from "@/lib/services/portfolioAnalytics.service";
import { formatCurrency, timeAgo } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

type SortField = "name" | "sku" | "jurisdiction" | "status" | "triageScore" | "lastActivity";
type SortDir = "asc" | "desc";

interface PortfolioTrendPoint {
  period: string;
  dealCount: number;
  avgTriageScore: number | null;
}

interface AgingBucket {
  label: string;
  minDays: number;
  maxDays: number | null;
  count: number;
  averageAgeDays: number;
  oldestDealAgeDays: number | null;
}

interface AgingSummary {
  totalDeals: number;
  averageAgeDays: number;
  oldestDeal: string;
  oldestDealAgeDays: number | null;
  buckets: AgingBucket[];
}

interface AssumptionBias {
  assumptionName: string;
  avgProjected: number;
  avgActual: number;
  avgVariancePct: number;
  sampleSize: number;
  direction: "over" | "under" | "neutral";
}

interface TriageCalibration {
  triageTier: string;
  totalDeals: number;
  exitedDeals: number;
  killedDeals: number;
  avgActualIrr: number | null;
  avgActualEquityMultiple: number | null;
  successRate: number;
}

interface OutcomeSummary {
  totalExited: number;
  totalKilled: number;
  avgIrr: number | null;
  avgEquityMultiple: number | null;
  avgHoldMonths: number | null;
  topBiases: AssumptionBias[];
  triageCalibration: TriageCalibration[];
  predictionTracking: {
    avgIrrOverestimatePct: number | null;
    avgTimelineUnderestimateMonths: number | null;
    riskAccuracyScore: number | null;
    sampleSize: number;
  };
}

interface PortfolioPayload {
  deals: Array<{
    id: string;
    name: string;
    sku: SkuType;
    status: string;
    jurisdiction: string;
    acreage: number;
    triageScore: number | null;
    updatedAt: string;
    createdAt: string;
  }>;
  metrics: {
    totalDeals: number;
    totalAcreage: number;
    avgTriageScore: number | null;
    byStatus: Record<string, number>;
    bySku: Record<string, number>;
    byJurisdiction: Record<string, number>;
  };
}

interface BuyerDealSummary {
  id: string;
  name: string;
  status: string;
  sku: string;
  jurisdiction?: {
    id: string;
    name: string;
    kind: string;
    state: string;
  } | null;
}

interface BuyersResponse {
  buyers: Array<{
    id: string;
    name: string;
    company?: string | null;
    buyerType?: string | null;
    email?: string | null;
    phone?: string | null;
    deals?: BuyerDealSummary[];
  }>;
}

type PortfolioPageTab = "analytics" | "outcomes" | "buyers";

type PortfolioPageProps = {
  initialPortfolio?: PortfolioPayload;
  initialAnalytics?: PortfolioSummary;
  initialConcentration?: ConcentrationAnalysis;
  initialDebtMaturity?: DebtMaturityWallData;
  initialVelocityMetrics?: DealVelocityAnalytics;
  initialCapitalDeployment?: CapitalDeploymentAnalytics;
  initialOutcomeSummary?: OutcomeSummary;
  initialBuyersResponse?: BuyersResponse;
  initialActiveTab?: PortfolioPageTab;
};

const AGING_BUCKETS: Array<{ label: string; minDays: number; maxDays: number | null }> = [
  { label: "0-3 days", minDays: 0, maxDays: 3 },
  { label: "4-7 days", minDays: 4, maxDays: 7 },
  { label: "8-14 days", minDays: 8, maxDays: 14 },
  { label: "15-30 days", minDays: 15, maxDays: 30 },
  { label: "31-60 days", minDays: 31, maxDays: 60 },
  { label: "60+ days", minDays: 61, maxDays: null },
];

const STATUS_ORDER: Record<string, number> = {};
PIPELINE_STAGES.forEach((s, i) => {
  STATUS_ORDER[s.key] = i;
});

function monthKey(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${date.getFullYear()}-${month}`;
}

function monthLabel(date: Date) {
  return `${date.toLocaleString("en-US", {
    month: "short",
    year: "2-digit",
  })}`;
}

function buildPortfolioTrend(deals: Array<PortfolioDeal & { triageScore: number | null; createdAt: string }>) {
  const now = new Date();
  const buckets = new Map<
    string,
    { period: string; dealCount: number; triageSum: number; triageCount: number }
  >();

  for (let i = 11; i >= 0; i -= 1) {
    const target = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.set(monthKey(target), {
      period: monthLabel(target),
      dealCount: 0,
      triageSum: 0,
      triageCount: 0,
    });
  }

  for (const deal of deals) {
    const createdAt = new Date(deal.createdAt);
    if (Number.isNaN(createdAt.getTime())) {
      continue;
    }
    const key = monthKey(createdAt);
    const bucket = buckets.get(key);
    if (!bucket) {
      continue;
    }

    bucket.dealCount += 1;
    if (deal.triageScore !== null) {
      bucket.triageSum += deal.triageScore;
      bucket.triageCount += 1;
    }
  }

  return Array.from(buckets.values()).map((bucket) => ({
    period: bucket.period,
    dealCount: bucket.dealCount,
    avgTriageScore:
      bucket.triageCount > 0 ? bucket.triageSum / bucket.triageCount : null,
  }));
}

function buildAgingSummary(deals: PortfolioDeal[]): AgingSummary {
  const now = Date.now();
  const ageBuckets: AgingBucket[] = AGING_BUCKETS.map((bucket) => ({
    label: bucket.label,
    minDays: bucket.minDays,
    maxDays: bucket.maxDays,
    count: 0,
    averageAgeDays: 0,
    oldestDealAgeDays: null,
  }));
  const ageSums = new Map<string, number>();

  let totalAge = 0;
  let totalWithTimestamp = 0;
  let oldestDeal = "--";
  let oldestAge: number | null = null;

  for (const deal of deals) {
    const updatedAt = new Date(deal.updatedAt);
    if (Number.isNaN(updatedAt.getTime())) {
      continue;
    }

    const ageDays = Math.max(
      0,
      Math.floor((now - updatedAt.getTime()) / (1000 * 60 * 60 * 24))
    );

    totalWithTimestamp += 1;
    totalAge += ageDays;

    if (oldestAge === null || ageDays > oldestAge) {
      oldestAge = ageDays;
      oldestDeal = deal.name;
    }

    const bucket = ageBuckets.find((entry) =>
      entry.maxDays === null
        ? ageDays >= entry.minDays
        : ageDays >= entry.minDays && ageDays <= entry.maxDays
    );

    if (!bucket) {
      continue;
    }
    bucket.count += 1;
    const ageSum = ageSums.get(bucket.label) ?? 0;
    ageSums.set(bucket.label, ageSum + ageDays);
    if (bucket.oldestDealAgeDays === null || ageDays > bucket.oldestDealAgeDays) {
      bucket.oldestDealAgeDays = ageDays;
    }
  }

  return {
    totalDeals: deals.length,
    averageAgeDays: totalWithTimestamp > 0 ? totalAge / totalWithTimestamp : 0,
    oldestDeal,
    oldestDealAgeDays: oldestAge,
    buckets: ageBuckets.map((bucket) => ({
      ...bucket,
      averageAgeDays:
        bucket.count > 0 && (ageSums.get(bucket.label) ?? 0) > 0
          ? (ageSums.get(bucket.label) ?? 0) / bucket.count
          : 0,
    })),
  };
}

function DealAgingDepthPanel({ deals }: { deals: PortfolioDeal[] }) {
  const summary = buildAgingSummary(deals);
  const maxCount = Math.max(...summary.buckets.map((bucket) => bucket.count), 1);

  if (summary.totalDeals === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Deal aging depth</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          No active deals to analyze aging.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Deal aging depth</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Active deals</p>
            <p className="font-semibold">{summary.totalDeals}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Avg days in current stage</p>
            <p className="font-semibold">{Math.round(summary.averageAgeDays)}d</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Oldest hold</p>
            <p className="truncate font-semibold">
              {summary.oldestDeal}{" "}
              {summary.oldestDealAgeDays != null
                ? `(${summary.oldestDealAgeDays}d)`
                : ""}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          {summary.buckets.map((bucket) => {
            const pct = (bucket.count / maxCount) * 100;
            return (
              <div key={bucket.label} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span>{bucket.label}</span>
                  <span className="text-muted-foreground">
                    {bucket.count} deal{bucket.count === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted">
                  <div
                    className="h-2 rounded-full bg-primary/80 transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                {bucket.count > 0 ? (
                  <p className="text-[10px] text-muted-foreground">
                    Avg age: {Math.round(bucket.averageAgeDays)}d
                    {bucket.oldestDealAgeDays != null ? ` · Oldest: ${bucket.oldestDealAgeDays}d` : ""}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function PortfolioTrendCards({ trend }: { trend: PortfolioTrendPoint[] }) {
  const hasDeals = trend.some((point) => point.dealCount > 0);
  const hasTriage = trend.some((point) => point.avgTriageScore !== null);
  const maxDealCount = Math.max(...trend.map((point) => point.dealCount), 1);
  const maxTriage = Math.max(
    ...trend.map((point) => point.avgTriageScore ?? 0),
    1,
  );

  if (!hasDeals && !hasTriage) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Portfolio pipeline trend</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          No trend data available for the last 12 months.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Portfolio pipeline trend (12 months)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {hasDeals && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              Deals introduced / month
            </p>
            <div className="space-y-1.5">
              {trend.map((point) => (
                <div key={`${point.period}-deals`} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span>{point.period}</span>
                    <span className="text-muted-foreground">{point.dealCount}</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full bg-primary transition-all"
                      style={{ width: `${(point.dealCount / maxDealCount) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {hasTriage && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              Avg triage score / month
            </p>
            <div className="space-y-1.5">
              {trend.map((point) => (
                <div key={`${point.period}-triage`} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span>{point.period}</span>
                    <span className="text-muted-foreground">
                      {point.avgTriageScore != null
                        ? `${Math.round(point.avgTriageScore)}`
                        : "—"}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full bg-emerald-500 transition-all"
                      style={{
                        width:
                          point.avgTriageScore != null
                            ? `${(point.avgTriageScore / maxTriage) * 100}%`
                            : "0%",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PortfolioPageContent({
  initialPortfolio,
  initialAnalytics,
  initialConcentration,
  initialDebtMaturity,
  initialVelocityMetrics,
  initialCapitalDeployment,
  initialOutcomeSummary,
  initialBuyersResponse,
  initialActiveTab = "analytics",
}: PortfolioPageProps) {
  const [sortField, setSortField] = useState<SortField>("lastActivity");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [isExporting, setIsExporting] = useState(false);
  const activeTab: PortfolioPageTab =
    initialActiveTab === "outcomes"
      ? "outcomes"
      : initialActiveTab === "buyers"
        ? "buyers"
        : "analytics";
  const isAnalyticsTab = activeTab === "analytics";
  const isOutcomesTab = activeTab === "outcomes";
  const isBuyersTab = activeTab === "buyers";

  const { data, isLoading } = useSWR<PortfolioPayload>(
    isAnalyticsTab ? "/api/portfolio" : null,
    fetcher,
    {
      fallbackData: initialPortfolio,
    },
  );

  // Enhanced analytics
  const { data: analytics } = useSWR<PortfolioSummary>(
    isAnalyticsTab ? "/api/portfolio/analytics" : null,
    fetcher,
    {
      fallbackData: initialAnalytics,
    },
  );
  const { data: concentration } = useSWR<ConcentrationAnalysis>(
    isAnalyticsTab ? "/api/portfolio/concentration" : null,
    fetcher,
    {
      fallbackData: initialConcentration,
    },
  );
  const { data: debtMaturity } = useSWR<DebtMaturityWallData>(
    isAnalyticsTab ? "/api/portfolio/debt-maturity" : null,
    fetcher,
    {
      fallbackData: initialDebtMaturity,
    },
  );
  const { data: velocityMetrics } = useSWR<DealVelocityAnalytics>(
    isAnalyticsTab ? "/api/portfolio/velocity" : null,
    fetcher,
    {
      fallbackData: initialVelocityMetrics,
    },
  );
  const { data: capitalDeployment } = useSWR<CapitalDeploymentAnalytics>(
    isAnalyticsTab ? "/api/portfolio/capital-deployment" : null,
    fetcher,
    {
      fallbackData: initialCapitalDeployment,
    },
  );

  const { data: outcomeSummary } = useSWR<OutcomeSummary>(
    isOutcomesTab ? "/api/outcomes?view=summary" : null,
    fetcher,
    {
      fallbackData: initialOutcomeSummary,
    }
  );
  const { data: buyersResponse } = useSWR<BuyersResponse>(
    isBuyersTab ? "/api/buyers?withDeals=true" : null,
    fetcher,
    {
      fallbackData: initialBuyersResponse,
    }
  );

  const buyers = buyersResponse?.buyers ?? [];

  if (activeTab === "outcomes") {
    if (!outcomeSummary) {
      return (
        <DashboardShell>
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            Loading outcome data...
          </div>
        </DashboardShell>
      );
    }

    return (
      <DashboardShell>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold">Outcome Tracking</h1>
            <p className="text-sm text-muted-foreground">
              Compare projected vs. actual performance, detect systematic biases,
              and calibrate triage scoring.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Exited Deals</p>
                <p className="text-lg font-bold">
                  {String(outcomeSummary.totalExited)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Killed Deals</p>
                <p className="text-lg font-bold">
                  {String(outcomeSummary.totalKilled)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Avg IRR</p>
                <p className="text-lg font-bold">
                  {outcomeSummary.avgIrr != null
                    ? `${outcomeSummary.avgIrr.toFixed(1)}%`
                    : "—"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Avg Equity Multiple</p>
                <p className="text-lg font-bold">
                  {outcomeSummary.avgEquityMultiple != null
                    ? `${outcomeSummary.avgEquityMultiple.toFixed(2)}x`
                    : "—"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Avg Hold Period</p>
                <p className="text-lg font-bold">
                  {outcomeSummary.avgHoldMonths != null
                    ? `${outcomeSummary.avgHoldMonths} mo`
                    : "—"}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent>
              <p className="mb-4 text-sm font-medium">Assumption Bias Detection</p>
              {outcomeSummary.topBiases.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No bias data yet. Record outcomes on exited deals to start tracking biases.
                </p>
              ) : (
                <div className="space-y-2">
                  {outcomeSummary.topBiases.map((bias) => (
                    <div
                      key={bias.assumptionName}
                      className="rounded-lg border p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium">{bias.assumptionName}</p>
                        <p
                          className={`text-sm font-semibold ${
                            Math.abs(bias.avgVariancePct) > 10
                              ? "text-red-500"
                              : Math.abs(bias.avgVariancePct) > 5
                                ? "text-amber-500"
                                : "text-green-500"
                          }`}
                        >
                          {bias.avgVariancePct > 0 ? "+" : ""}
                          {bias.avgVariancePct.toFixed(1)}%
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Projected avg {bias.avgProjected} vs actual {bias.avgActual}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3">
              <p className="text-sm font-medium">Triage Prediction vs Actual Calibration</p>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded border p-3">
                  <p className="text-xs text-muted-foreground">Avg IRR Overestimate</p>
                  <p className="text-lg font-semibold">
                    {outcomeSummary.predictionTracking.avgIrrOverestimatePct != null
                      ? `${outcomeSummary.predictionTracking.avgIrrOverestimatePct > 0 ? "+" : ""}${outcomeSummary.predictionTracking.avgIrrOverestimatePct.toFixed(2)} pp`
                      : "—"}
                  </p>
                </div>
                <div className="rounded border p-3">
                  <p className="text-xs text-muted-foreground">Avg Timeline Underestimate</p>
                  <p className="text-lg font-semibold">
                    {outcomeSummary.predictionTracking.avgTimelineUnderestimateMonths != null
                      ? `${outcomeSummary.predictionTracking.avgTimelineUnderestimateMonths > 0 ? "+" : ""}${outcomeSummary.predictionTracking.avgTimelineUnderestimateMonths.toFixed(2)} mo`
                      : "—"}
                  </p>
                </div>
                <div className="rounded border p-3">
                  <p className="text-xs text-muted-foreground">Risk Accuracy Score</p>
                  <p className="text-lg font-semibold">
                    {outcomeSummary.predictionTracking.riskAccuracyScore != null
                      ? `${outcomeSummary.predictionTracking.riskAccuracyScore.toFixed(1)} / 100`
                      : "—"}
                  </p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Sample size: {outcomeSummary.predictionTracking.sampleSize}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3">
              <p className="text-sm font-medium">Triage Tier Calibration</p>
              {outcomeSummary.triageCalibration.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No triage calibration data yet.
                </p>
              ) : (
                outcomeSummary.triageCalibration.map((row) => (
                  <div key={row.triageTier} className="rounded border p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="font-medium">{row.triageTier}</p>
                      <p className="text-xs text-muted-foreground">n={row.totalDeals}</p>
                    </div>
                    <div className="grid gap-2 text-xs md:grid-cols-4">
                      <div>Success: {row.successRate}%</div>
                      <div>Exited: {row.exitedDeals}</div>
                      <div>Killed: {row.killedDeals}</div>
                      <div>Avg IRR: {row.avgActualIrr != null ? `${row.avgActualIrr}%` : "—"}</div>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full bg-emerald-500"
                        style={{ width: `${Math.min(Math.max(row.successRate, 0), 100)}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </DashboardShell>
    );
  }

  if (activeTab === "buyers") {
    return (
      <DashboardShell>
        <Card>
          <CardHeader>
            <CardTitle>Buyers</CardTitle>
          </CardHeader>
          <CardContent>
            {buyers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No buyers yet.</p>
            ) : (
                  <div className="space-y-2">
                {buyers.map((buyer) => (
                  <div key={buyer.id} className="rounded-lg border p-3">
                    <p className="font-medium">{buyer.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {(buyer.company ?? "—") +
                        (buyer.buyerType ? ` · ${buyer.buyerType}` : "")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {(buyer.email ?? "—") + (buyer.phone ? ` · ${buyer.phone}` : "")}
                    </p>
                    {buyer.deals && buyer.deals.length > 0 ? (
                      <div className="mt-2 space-y-1">
                        <p className="text-xs font-medium">Deals</p>
                        <div className="space-y-1">
                          {buyer.deals.map((deal) => (
                            <Link
                              key={deal.id}
                              href={`/deals/${deal.id}`}
                              className="inline-flex max-w-full items-center gap-2 rounded bg-muted px-2 py-1 text-xs hover:underline"
                            >
                              <span className="truncate">{deal.name}</span>
                              <span className="text-muted-foreground">
                                · {deal.sku} / {deal.status}
                              </span>
                              <span className="text-muted-foreground">
                                {deal.jurisdiction?.name ?? "Unknown"}
                              </span>
                            </Link>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </DashboardShell>
    );
  }

  const deals: PortfolioDeal[] = useMemo(
    () =>
      (data?.deals ?? []).map((d) => ({
        id: d.id,
        name: d.name,
        sku: d.sku,
        jurisdiction: d.jurisdiction,
        status: d.status as PortfolioDeal["status"],
        triageScore: d.triageScore,
        acreage: d.acreage,
        updatedAt: d.updatedAt,
        createdAt: d.createdAt,
      })),
    [data]
  );

  const metrics = data?.metrics;

  const activeDeals = deals.filter(
    (d) => d.status !== "KILLED" && d.status !== "EXITED"
  );

  const sortedDeals = useMemo(() => {
    return [...activeDeals].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "sku":
          cmp = a.sku.localeCompare(b.sku);
          break;
        case "jurisdiction":
          cmp = a.jurisdiction.localeCompare(b.jurisdiction);
          break;
        case "status":
          cmp = (STATUS_ORDER[a.status] ?? 0) - (STATUS_ORDER[b.status] ?? 0);
          break;
        case "triageScore":
          cmp = (a.triageScore ?? 0) - (b.triageScore ?? 0);
          break;
        case "lastActivity":
          cmp =
            new Date(a.updatedAt).getTime() -
            new Date(b.updatedAt).getTime();
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [activeDeals, sortField, sortDir]);

  const portfolioTrend = useMemo(
    () => buildPortfolioTrend(deals),
    [deals],
  );

  const handleExportPortfolioReport = useCallback(() => {
    if (isExporting || !data) return;

    setIsExporting(true);

    try {
      const escapeCsvCell = (value: string) =>
        `"${value.replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;

      const dealHeaders = [
        "id",
        "name",
        "sku",
        "status",
        "jurisdiction",
        "acreage",
        "triageScore",
        "updatedAt",
        "createdAt",
      ];

      const dealRows = activeDeals.map((deal) => [
        deal.id,
        deal.name,
        deal.sku,
        deal.status,
        deal.jurisdiction,
        String(deal.acreage),
        deal.triageScore === null ? "" : String(deal.triageScore),
        deal.updatedAt,
        deal.createdAt,
      ]);

      const keyValueRows = [
        ["metric", "value"],
        ["totalDeals", String(data.metrics?.totalDeals ?? 0)],
        ["totalAcreage", String(data.metrics?.totalAcreage ?? 0)],
        ["avgTriageScore", String(data.metrics?.avgTriageScore ?? "")],
        ["activeDeals", String(activeDeals.length)],
        ["pipelineDeals", String(deals.length)],
      ];

      if (analytics) {
        keyValueRows.push(
          ["weightedAvgIRR", String(analytics.weightedAvgIRR ?? "")],
          ["weightedAvgCapRate", String(analytics.weightedAvgCapRate ?? "")],
          ["analyticsAvgTriageScore", String(analytics.avgTriageScore ?? "")],
        );

        for (const [key, value] of Object.entries(analytics.byStatus)) {
          keyValueRows.push([`byStatus.${key}`, String(value)]);
        }
        for (const [key, value] of Object.entries(analytics.bySku)) {
          keyValueRows.push([`bySku.${key}`, String(value)]);
        }
        for (const [key, value] of Object.entries(analytics.byJurisdiction)) {
          keyValueRows.push([`byJurisdiction.${key}`, String(value)]);
        }
      }

      const trendRows = [
        ["period", "dealCount", "avgTriageScore"],
        ...portfolioTrend.map((point) => [
          point.period,
          String(point.dealCount),
          point.avgTriageScore === null ? "" : String(point.avgTriageScore),
        ]),
      ];

      const csv = [
        "# Portfolio active deals",
        dealHeaders.map(escapeCsvCell).join(","),
        ...dealRows.map((row) => row.map((cell) => escapeCsvCell(cell)).join(",")),
        "",
        "# Portfolio metrics",
        ...keyValueRows.map((row) => row.map((cell) => escapeCsvCell(cell)).join(",")),
        "",
        "# Pipeline trend",
        ...trendRows.map((row) => row.map((cell) => escapeCsvCell(cell)).join(",")),
      ].join("\n");

      const blob = new Blob([`\uFEFF${csv}`], {
        type: "text/csv;charset=utf-8;",
      });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute(
        "download",
        `portfolio-report-${new Date().toISOString().slice(0, 10)}.csv`
      );
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success(
        `Exported portfolio report (${activeDeals.length} active deals).`
      );
    } catch {
      toast.error("Failed to export portfolio report.");
    } finally {
      setIsExporting(false);
    }
  }, [activeDeals, analytics, data, isExporting, portfolioTrend]);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) {
      return <ArrowUpDown className="ml-1 inline h-3 w-3 text-muted-foreground/50" />;
    }
    return sortDir === "asc" ? (
      <ChevronUp className="ml-1 inline h-3 w-3" />
    ) : (
      <ChevronDown className="ml-1 inline h-3 w-3" />
    );
  }

  function getScoreColor(score: number | null): string {
    if (score === null) return "text-muted-foreground";
    if (score >= 80) return "text-emerald-600 dark:text-emerald-400";
    if (score >= 60) return "text-amber-600 dark:text-amber-400";
    return "text-red-600 dark:text-red-400";
  }

  function getStatusBadge(status: string) {
    const stage = PIPELINE_STAGES.find((s) => s.key === status);
    return (
      <Badge
        variant="outline"
        className="text-xs"
        style={{
          borderColor: stage?.color,
          color: stage?.color,
          backgroundColor: `${stage?.color}10`,
        }}
      >
        {stage?.label ?? status}
      </Badge>
    );
  }

  if (isLoading) {
    return (
      <DashboardShell>
        <div className="space-y-6">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <Skeleton className="h-7 w-72" />
              <Skeleton className="h-4 w-56" />
            </div>
            <Skeleton className="h-8 w-32" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Skeleton className="h-72 rounded-xl" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <Skeleton className="h-72 rounded-xl" />
              <Skeleton className="h-72 rounded-xl" />
            </div>
          </div>

          <Skeleton className="h-56 rounded-xl" />

          <Card>
            <CardHeader>
              <CardTitle>Analytics tabs loading...</CardTitle>
            </CardHeader>
            <CardContent>
              <Skeleton className="h-72" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-40" />
            </CardHeader>
            <CardContent className="space-y-2">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </CardContent>
          </Card>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      {/* Page Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Portfolio Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Real-time overview of your development pipeline
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleExportPortfolioReport}
            disabled={isExporting || !data}
          >
            <Download className="mr-2 h-4 w-4" />
            {isExporting ? "Exporting..." : "Export"}
          </Button>
          <Link
            href="/portfolio/holdings"
            className="text-sm font-medium text-primary hover:underline"
          >
            View Holdings →
          </Link>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Active Deals"
          value={String(metrics?.totalDeals ?? 0)}
          icon={LayoutGrid}
        />
        <MetricCard
          label="Acreage Under Management"
          value={`${(metrics?.totalAcreage ?? 0).toFixed(1)} ac`}
          icon={MapIcon}
        />
        <MetricCard
          label="Wtd Avg IRR"
          value={
            analytics?.weightedAvgIRR != null
              ? `${analytics.weightedAvgIRR.toFixed(1)}%`
              : "--"
          }
          icon={TrendingUp}
        />
        <MetricCard
          label="Wtd Avg Cap Rate"
          value={
            analytics?.weightedAvgCapRate != null
              ? `${analytics.weightedAvgCapRate.toFixed(1)}%`
              : "--"
          }
          icon={DollarSign}
        />
      </div>

      {/* Enhanced metrics row */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Total Equity Deployed"
          value={
            analytics?.totalEquityDeployed
              ? formatCurrency(analytics.totalEquityDeployed)
              : "--"
          }
          icon={DollarSign}
        />
        <MetricCard
          label="Avg Triage Score"
          value={analytics?.avgTriageScore ? String(analytics.avgTriageScore) : "--"}
          icon={Target}
        />
        <MetricCard
          label="Deal Pipeline"
          value={`${deals.length} total`}
          icon={BarChart3}
        />
        <MetricCard
          label="Active Pipeline"
          value={`${activeDeals.length} deals`}
          icon={LayoutGrid}
        />
      </div>

      {/* Pipeline + Charts Row */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <PipelineFunnel deals={deals} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <SkuDonut deals={deals} />
          <JurisdictionBar deals={deals} />
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <PortfolioTrendCards trend={portfolioTrend} />
        <DealAgingDepthPanel deals={activeDeals} />
      </div>

      {/* Analytics Tabs */}
      <Tabs defaultValue="concentration" className="mt-6">
        <TabsList>
          <TabsTrigger value="concentration">Concentration Risk</TabsTrigger>
          <TabsTrigger value="velocity">Deal Velocity</TabsTrigger>
          <TabsTrigger value="debt">Debt Maturity Wall</TabsTrigger>
          <TabsTrigger value="deployment">Capital Deployment</TabsTrigger>
          <TabsTrigger value="allocation">Capital Allocation</TabsTrigger>
          <TabsTrigger value="1031">1031 Exchange</TabsTrigger>
          <TabsTrigger value="stress">Stress Test</TabsTrigger>
        </TabsList>

        <TabsContent value="concentration" className="mt-4">
          {concentration ? (
            <ConcentrationCharts data={concentration} />
          ) : (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
        </TabsContent>

        <TabsContent value="velocity" className="mt-4">
          {velocityMetrics ? (
            <DealVelocityMetrics data={velocityMetrics} />
          ) : (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
        </TabsContent>

        <TabsContent value="debt" className="mt-4">
          {debtMaturity ? (
            <DebtMaturityWall data={debtMaturity} />
          ) : (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
        </TabsContent>

        <TabsContent value="deployment" className="mt-4">
          {capitalDeployment ? (
            <CapitalDeploymentTracker data={capitalDeployment} />
          ) : (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
        </TabsContent>

        <TabsContent value="allocation" className="mt-4">
          <CapitalAllocationWidget />
        </TabsContent>

        <TabsContent value="1031" className="mt-4">
          <Exchange1031Matcher deals={deals} />
        </TabsContent>

        <TabsContent value="stress" className="mt-4">
          <StressTestPanel />
        </TabsContent>
      </Tabs>

      {/* Active Deals Table */}
      <Card className="mt-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Active Deals</CardTitle>
        </CardHeader>
        <CardContent>
          {sortedDeals.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No active deals yet. Create a deal from the Chat interface to get started.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead
                    className="cursor-pointer select-none"
                    onClick={() => toggleSort("name")}
                  >
                    Name <SortIcon field="name" />
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none"
                    onClick={() => toggleSort("sku")}
                  >
                    SKU <SortIcon field="sku" />
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none"
                    onClick={() => toggleSort("jurisdiction")}
                  >
                    Parish <SortIcon field="jurisdiction" />
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none"
                    onClick={() => toggleSort("status")}
                  >
                    Status <SortIcon field="status" />
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none text-right"
                    onClick={() => toggleSort("triageScore")}
                  >
                    Score <SortIcon field="triageScore" />
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none text-right"
                    onClick={() => toggleSort("lastActivity")}
                  >
                    Last Activity <SortIcon field="lastActivity" />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedDeals.map((deal) => (
                  <TableRow key={deal.id} className="cursor-pointer">
                    <TableCell className="font-medium">
                      <Link
                        href={`/deals/${deal.id}`}
                        className="hover:underline"
                      >
                        {deal.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <div
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: SKU_CONFIG[deal.sku]?.color }}
                        />
                        <span className="text-xs">{SKU_CONFIG[deal.sku]?.label ?? deal.sku}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{deal.jurisdiction}</TableCell>
                    <TableCell>{getStatusBadge(deal.status)}</TableCell>
                    <TableCell className="text-right">
                      {deal.triageScore !== null ? (
                        <span
                          className={cn(
                            "text-sm font-semibold tabular-nums",
                            getScoreColor(deal.triageScore)
                          )}
                        >
                          {deal.triageScore}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">--</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {timeAgo(deal.updatedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </DashboardShell>
  );
}

export default function PortfolioPage({
  initialPortfolio,
  initialAnalytics,
  initialConcentration,
  initialDebtMaturity,
  initialVelocityMetrics,
  initialCapitalDeployment,
  initialOutcomeSummary,
  initialBuyersResponse,
  initialActiveTab = "analytics",
}: PortfolioPageProps = {}) {
  return (
    <PortfolioPageContent
      initialPortfolio={initialPortfolio}
      initialAnalytics={initialAnalytics}
      initialConcentration={initialConcentration}
      initialDebtMaturity={initialDebtMaturity}
      initialVelocityMetrics={initialVelocityMetrics}
      initialCapitalDeployment={initialCapitalDeployment}
      initialOutcomeSummary={initialOutcomeSummary}
      initialBuyersResponse={initialBuyersResponse}
      initialActiveTab={initialActiveTab}
    />
  );
}
