"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  LayoutGrid,
  Map,
  TrendingUp,
  Target,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  Loader2,
  DollarSign,
  BarChart3,
} from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { PipelineFunnel } from "@/components/portfolio/PipelineFunnel";
import { SkuDonut, JurisdictionBar } from "@/components/portfolio/DealVelocityChart";
import { ConcentrationCharts } from "@/components/portfolio/ConcentrationCharts";
import { CapitalAllocationWidget } from "@/components/portfolio/CapitalAllocationWidget";
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
} from "@/lib/services/portfolioAnalytics.service";
import { formatCurrency, timeAgo } from "@/lib/utils";
import { cn } from "@/lib/utils";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

type SortField = "name" | "sku" | "jurisdiction" | "status" | "triageScore" | "lastActivity";
type SortDir = "asc" | "desc";

const STATUS_ORDER: Record<string, number> = {};
PIPELINE_STAGES.forEach((s, i) => {
  STATUS_ORDER[s.key] = i;
});

export default function PortfolioPage() {
  const { data, isLoading } = useSWR<{
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
  }>("/api/portfolio", fetcher);

  // Enhanced analytics
  const { data: analytics } = useSWR<PortfolioSummary>(
    "/api/portfolio/analytics",
    fetcher
  );
  const { data: concentration } = useSWR<ConcentrationAnalysis>(
    "/api/portfolio/concentration",
    fetcher
  );

  const [sortField, setSortField] = useState<SortField>("lastActivity");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

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
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
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
        <Link
          href="/portfolio/holdings"
          className="text-sm font-medium text-primary hover:underline"
        >
          View Holdings →
        </Link>
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
          icon={Map}
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

      {/* Analytics Tabs */}
      <Tabs defaultValue="concentration" className="mt-6">
        <TabsList>
          <TabsTrigger value="concentration">Concentration Risk</TabsTrigger>
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
