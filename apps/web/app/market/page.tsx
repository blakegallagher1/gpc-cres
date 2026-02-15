"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { DashboardShell } from "@/components/layout/DashboardShell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TrendingUp,
  TrendingDown,
  Building,
  FileText,
  Home,
  DollarSign,
  BarChart3,
  Clock,
} from "lucide-react";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const PARISHES = [
  "East Baton Rouge",
  "Ascension",
  "Livingston",
  "West Baton Rouge",
  "Iberville",
];

const DATA_TYPES = [
  { value: "comp_sale", label: "Comp Sales", icon: DollarSign },
  { value: "listing", label: "Listings", icon: Home },
  { value: "permit", label: "Permits", icon: FileText },
  { value: "vacancy", label: "Vacancy", icon: Building },
  { value: "rent", label: "Rent", icon: TrendingUp },
];

interface MarketDataRecord {
  id: string;
  parish: string;
  dataType: string;
  source: string;
  data: Record<string, unknown>;
  observedAt: string;
  createdAt: string;
}

interface ParishSummary {
  parish: string;
  compSaleCount: number;
  listingCount: number;
  permitCount: number;
  avgSalePricePsf: number | null;
  avgCapRate: number | null;
  avgDaysOnMarket: number | null;
  recentComps: MarketDataRecord[];
  recentListings: MarketDataRecord[];
}

interface MarketTrend {
  period: string;
  avgPricePsf: number | null;
  avgCapRate: number | null;
  transactionCount: number;
}

function MarketTrendCharts({ trends }: { trends: MarketTrend[] }) {
  const ordered = useMemo(
    () => trends.slice().sort((a, b) => a.period.localeCompare(b.period)),
    [trends],
  );

  if (ordered.length === 0) {
    return null;
  }

  const maxPrice = Math.max(
    ...ordered.map((point) => point.avgPricePsf ?? 0),
    1,
  );
  const maxCap = Math.max(
    ...ordered.map((point) => point.avgCapRate ?? 0),
    1,
  );
  const maxTx = Math.max(
    ...ordered.map((point) => point.transactionCount),
    1,
  );

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Avg $/SF trend</CardTitle>
          <CardDescription>12-month comp trend</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {ordered.map((point) => {
            const width = point.avgPricePsf === null ? 0 : (point.avgPricePsf / maxPrice) * 100;

            return (
              <div key={`${point.period}-psf`} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span>{point.period}</span>
                  <span className="text-muted-foreground">
                    {point.avgPricePsf != null
                      ? `$${point.avgPricePsf.toFixed(2)}`
                      : "—"}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted">
                  <div
                    className="h-2 rounded-full bg-primary transition-all"
                    style={{ width: `${width}%` }}
                  />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Avg cap rate trend</CardTitle>
          <CardDescription>12-month comp trend</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {ordered.map((point) => {
            const width = point.avgCapRate === null ? 0 : (point.avgCapRate / maxCap) * 100;
            return (
              <div key={`${point.period}-cap`} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span>{point.period}</span>
                  <span className="text-muted-foreground">
                    {point.avgCapRate != null
                      ? `${point.avgCapRate.toFixed(2)}%`
                      : "—"}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted">
                  <div
                    className="h-2 rounded-full bg-emerald-500 transition-all"
                    style={{ width: `${width}%` }}
                  />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Transaction volume trend</CardTitle>
          <CardDescription>Monthly comp transaction count</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {ordered.map((point) => {
            const width = (point.transactionCount / maxTx) * 100;
            return (
              <div key={`${point.period}-txn`} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span>{point.period}</span>
                  <span className="text-muted-foreground">
                    {point.transactionCount}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted">
                  <div
                    className="h-2 rounded-full bg-indigo-500 transition-all"
                    style={{ width: `${width}%` }}
                  />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  trend,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  trend?: "up" | "down" | "neutral";
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <div className="flex items-center gap-1.5">
            <p className="text-lg font-bold">{value}</p>
            {trend === "up" && (
              <TrendingUp className="h-3.5 w-3.5 text-green-500" />
            )}
            {trend === "down" && (
              <TrendingDown className="h-3.5 w-3.5 text-red-500" />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ParishDashboard({ parish }: { parish: string }) {
  const { data: summary, isLoading: isSummaryLoading } = useSWR<ParishSummary>(
    `/api/market?view=summary&parish=${encodeURIComponent(parish)}`,
    fetcher,
    { refreshInterval: 60_000 }
  );

  const { data: trendsData, isLoading: isTrendsLoading } = useSWR<{ trends: MarketTrend[] }>(
    `/api/market?view=trends&parish=${encodeURIComponent(parish)}&months=12`,
    fetcher,
    { refreshInterval: 300_000 }
  );

  if (isSummaryLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
        <Card>
          <CardHeader className="pb-3">
            <Skeleton className="h-5 w-52" />
            <Skeleton className="mt-2 h-4 w-40" />
          </CardHeader>
          <CardContent className="space-y-2">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </CardContent>
        </Card>
      </div>
    );
  }

  const trends = trendsData?.trends ?? [];

  if (!summary) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Unable to load market summary for {parish}. Please retry.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Comp Sales"
          value={String(summary.compSaleCount)}
          icon={DollarSign}
        />
        <StatCard
          label="Active Listings"
          value={String(summary.listingCount)}
          icon={Home}
        />
        <StatCard
          label="Permits Filed"
          value={String(summary.permitCount)}
          icon={FileText}
        />
        <StatCard
          label="Avg $/SF"
          value={
            summary.avgSalePricePsf != null
              ? `$${summary.avgSalePricePsf.toFixed(2)}`
              : "—"
          }
          icon={BarChart3}
        />
        <StatCard
          label="Avg Cap Rate"
          value={
            summary.avgCapRate != null
              ? `${summary.avgCapRate.toFixed(2)}%`
              : "—"
          }
          icon={TrendingUp}
        />
        <StatCard
          label="Avg DOM"
          value={
            summary.avgDaysOnMarket != null
              ? `${summary.avgDaysOnMarket}d`
              : "—"
          }
          icon={Clock}
        />
      </div>

      {/* Trends charts */}
      {isTrendsLoading && trends.length === 0 ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {[...Array(3)].map((_, index) => (
            <Skeleton key={`trend-skeleton-${index}`} className="h-56" />
          ))}
        </div>
      ) : (
        trends.length > 0 ? <MarketTrendCharts trends={trends} /> : null
      )}

      {/* Trends table */}
      {trends.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Monthly Trends (12 mo)</CardTitle>
            <CardDescription>
              Comp sale price/SF, cap rates, and transaction volume
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Period</th>
                    <th className="pb-2 pr-4 font-medium text-right">
                      Avg $/SF
                    </th>
                    <th className="pb-2 pr-4 font-medium text-right">
                      Avg Cap Rate
                    </th>
                    <th className="pb-2 font-medium text-right">Txns</th>
                  </tr>
                </thead>
                <tbody>
                  {trends.map((t) => (
                    <tr key={t.period} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-medium">{t.period}</td>
                      <td className="py-2 pr-4 text-right">
                        {t.avgPricePsf != null
                          ? `$${t.avgPricePsf.toFixed(2)}`
                          : "—"}
                      </td>
                      <td className="py-2 pr-4 text-right">
                        {t.avgCapRate != null
                          ? `${t.avgCapRate.toFixed(2)}%`
                          : "—"}
                      </td>
                      <td className="py-2 text-right">
                        {t.transactionCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent comps */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Comp Sales</CardTitle>
          <CardDescription>
            Last 90 days, up to 10 most recent
          </CardDescription>
        </CardHeader>
        <CardContent>
          {summary.recentComps.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No comp sales recorded yet.
            </p>
          ) : (
            <div className="space-y-2">
              {summary.recentComps.map((c) => {
                const d = c.data;
                return (
                  <div
                    key={c.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {(d.address as string) ?? "Unknown Address"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {c.source} &middot;{" "}
                        {new Date(c.observedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 text-right">
                      {typeof d.price_psf === "number" && (
                        <Badge variant="outline">
                          ${d.price_psf.toFixed(2)}/SF
                        </Badge>
                      )}
                      {typeof d.cap_rate === "number" && (
                        <Badge variant="secondary">
                          {d.cap_rate.toFixed(2)}% cap
                        </Badge>
                      )}
                      {typeof d.sale_price === "number" && (
                        <span className="text-sm font-semibold">
                          ${(d.sale_price as number).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent listings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Listings</CardTitle>
          <CardDescription>Active listings in parish</CardDescription>
        </CardHeader>
        <CardContent>
          {summary.recentListings.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No listings recorded yet.
            </p>
          ) : (
            <div className="space-y-2">
              {summary.recentListings.map((l) => {
                const d = l.data;
                return (
                  <div
                    key={l.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {(d.address as string) ?? "Unknown Address"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {l.source} &middot;{" "}
                        {new Date(l.observedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 text-right">
                      {typeof d.asking_price === "number" && (
                        <span className="text-sm font-semibold">
                          ${(d.asking_price as number).toLocaleString()}
                        </span>
                      )}
                      {typeof d.days_on_market === "number" && (
                        <Badge variant="outline">
                          {d.days_on_market}d on market
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RecentFeed({
  dataType,
}: {
  dataType: string | undefined;
}) {
  const url = dataType
    ? `/api/market?view=recent&dataType=${dataType}&limit=50`
    : `/api/market?view=recent&limit=50`;

  const { data, isLoading: isLoadingFeed } = useSWR<{ data: MarketDataRecord[] }>(
    url,
    fetcher,
    {
    refreshInterval: 30_000,
    }
  );

  const records = data?.data ?? [];

  if (isLoadingFeed) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, index) => (
          <div
            key={`feed-skeleton-${index}`}
            className="space-y-2 rounded-lg border p-3"
          >
            <div className="flex items-start gap-3">
              <Skeleton className="h-8 w-8 shrink-0" />
              <div className="min-w-0 flex-1 space-y-1">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <Skeleton className="h-4 w-20" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No market data points yet. Data will appear here as the monitoring
        system collects comp sales, listings, and permits.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {records.map((r) => {
        const typeInfo = DATA_TYPES.find((dt) => dt.value === r.dataType);
        const Icon = typeInfo?.icon ?? Building;
        return (
          <div
            key={r.id}
            className="flex items-start gap-3 rounded-lg border p-3"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-muted">
              <Icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {typeInfo?.label ?? r.dataType}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {r.parish}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {r.source} &middot;{" "}
                {new Date(r.observedAt).toLocaleDateString()}
              </p>
              {typeof r.data.address === "string" && (
                <p className="mt-0.5 truncate text-sm">
                  {r.data.address}
                </p>
              )}
            </div>
            <div className="shrink-0 text-right">
              {typeof r.data.sale_price === "number" && (
                <p className="text-sm font-semibold">
                  ${(r.data.sale_price as number).toLocaleString()}
                </p>
              )}
              {typeof r.data.asking_price === "number" && (
                <p className="text-sm font-semibold">
                  ${(r.data.asking_price as number).toLocaleString()}
                </p>
              )}
              {typeof r.data.price_psf === "number" && (
                <p className="text-xs text-muted-foreground">
                  ${(r.data.price_psf as number).toFixed(2)}/SF
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function MarketPage() {
  const [selectedParish, setSelectedParish] = useState(PARISHES[0]);
  const [feedFilter, setFeedFilter] = useState<string | undefined>(undefined);

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Market Intelligence</h1>
            <p className="text-sm text-muted-foreground">
              Parish-level market data, comp sales, listings, and trends
            </p>
          </div>
        </div>

        <Tabs defaultValue="parish" className="space-y-4">
          <TabsList>
            <TabsTrigger value="parish">Parish Dashboard</TabsTrigger>
            <TabsTrigger value="feed">Recent Activity</TabsTrigger>
          </TabsList>

          <TabsContent value="parish" className="space-y-4">
            <div className="flex items-center gap-3">
              <Select
                value={selectedParish}
                onValueChange={setSelectedParish}
              >
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Select parish" />
                </SelectTrigger>
                <SelectContent>
                  {PARISHES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <ParishDashboard parish={selectedParish} />
          </TabsContent>

          <TabsContent value="feed" className="space-y-4">
            <div className="flex items-center gap-2">
              <Button
                variant={feedFilter === undefined ? "default" : "outline"}
                size="sm"
                onClick={() => setFeedFilter(undefined)}
              >
                All
              </Button>
              {DATA_TYPES.map((dt) => (
                <Button
                  key={dt.value}
                  variant={feedFilter === dt.value ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFeedFilter(dt.value)}
                >
                  {dt.label}
                </Button>
              ))}
            </div>

            <RecentFeed dataType={feedFilter} />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardShell>
  );
}
