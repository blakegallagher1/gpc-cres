"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  LayoutGrid,
  Map,
  TrendingUp,
  Target,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { ActivityFeed } from "@/components/portfolio/ActivityFeed";
import { SkuDonut, JurisdictionBar } from "@/components/portfolio/DealVelocityChart";
import {
  mockDeals,
  mockActivityEvents,
  mockPortfolioMetrics,
  SKU_CONFIG,
  PIPELINE_STAGES,
  type MockDeal,
} from "@/lib/data/mockPortfolio";
import { formatCurrency, timeAgo } from "@/lib/utils";
import { cn } from "@/lib/utils";

type SortField = "name" | "sku" | "jurisdiction" | "status" | "triageScore" | "lastActivity";
type SortDir = "asc" | "desc";

const STATUS_ORDER: Record<string, number> = {};
PIPELINE_STAGES.forEach((s, i) => {
  STATUS_ORDER[s.key] = i;
});

export default function PortfolioPage() {
  const [sortField, setSortField] = useState<SortField>("lastActivity");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const activeDeals = mockDeals.filter(
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
            new Date(a.lastActivity).getTime() -
            new Date(b.lastActivity).getTime();
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
          value={String(mockPortfolioMetrics.totalDeals)}
          change={mockPortfolioMetrics.dealsChange}
          changeLabel="vs last month"
          icon={LayoutGrid}
        />
        <MetricCard
          label="Acreage Under Management"
          value={`${mockPortfolioMetrics.totalAcreage.toFixed(1)} ac`}
          change={mockPortfolioMetrics.acreageChange}
          changeLabel="vs last month"
          icon={Map}
        />
        <MetricCard
          label="Pipeline Value"
          value={formatCurrency(mockPortfolioMetrics.pipelineValue).replace(".00", "")}
          change={mockPortfolioMetrics.pipelineChange}
          changeLabel="vs last month"
          icon={TrendingUp}
        />
        <MetricCard
          label="Avg Triage Score"
          value={String(mockPortfolioMetrics.avgTriageScore)}
          change={mockPortfolioMetrics.scoreChange}
          changeLabel="vs last month"
          icon={Target}
        />
      </div>

      {/* Pipeline + Charts Row */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <PipelineFunnel deals={mockDeals} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <SkuDonut deals={mockDeals} />
          <JurisdictionBar deals={mockDeals} />
        </div>
      </div>

      {/* Activity Feed + Table */}
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {/* Activity Feed */}
        <div className="lg:col-span-1">
          <ActivityFeed events={mockActivityEvents} />
        </div>

        {/* Active Deals Table */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Active Deals</CardTitle>
          </CardHeader>
          <CardContent>
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
                          style={{ backgroundColor: SKU_CONFIG[deal.sku].color }}
                        />
                        <span className="text-xs">{SKU_CONFIG[deal.sku].label}</span>
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
                      {timeAgo(deal.lastActivity)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
