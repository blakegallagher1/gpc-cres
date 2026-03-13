"use client";

import Link from "next/link";
import { useDeferredValue, useState, useTransition } from "react";
import useSWR from "swr";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  BarChart3,
  Clock3,
  FileText,
  Filter,
  Landmark,
  Loader2,
  RefreshCw,
  Search,
} from "lucide-react";
import { MetricCard } from "@/components/portfolio/MetricCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type BuildingPermitsDesignation = "all" | "commercial" | "residential";

type FilterState = {
  windowDays: string;
  permitType: string;
  designation: BuildingPermitsDesignation;
  zip: string;
};

type BuildingPermitsBreakdownPoint = {
  label: string;
  permitCount: number;
  totalProjectValue: number;
};

type BuildingPermitRecord = {
  permitNumber: string;
  permitType: string;
  designation: string | null;
  projectDescription: string | null;
  projectValue: number;
  permitFee: number;
  issuedDate: string | null;
  address: string | null;
  zip: string | null;
  ownerName: string | null;
  applicantName: string | null;
  contractorName: string | null;
};

type BuildingPermitsFeedResponse = {
  dataset: {
    id: string;
    sourceUrl: string;
    apiBaseUrl: string;
    refreshedAt: string;
  };
  filters: {
    days: number;
    designation: BuildingPermitsDesignation;
    limit: number;
    permitType?: string | null;
    zipCode?: string | null;
  };
  totals: {
    permitCount: number;
    totalProjectValue: number;
    averageProjectValue: number | null;
    totalPermitFees: number;
    latestIssuedDate: string | null;
  };
  issuedTrend: Array<{
    issuedDay: string;
    permitCount: number;
    totalProjectValue: number;
  }>;
  designationBreakdown: BuildingPermitsBreakdownPoint[];
  topPermitTypes: BuildingPermitsBreakdownPoint[];
  topZipCodes: BuildingPermitsBreakdownPoint[];
  recentPermits: BuildingPermitRecord[];
};

type PermitTableRecord = {
  id: string;
  permitNumber: string;
  permitType: string;
  designation: string;
  projectDescription: string;
  projectValue: number;
  permitFee: number;
  issuedDate: string | null;
  address: string;
  zip: string;
  ownerName: string;
  applicantName: string;
  contractorName: string;
};

type ChartPoint = {
  label: string;
  count: number;
  totalValue: number;
};

const DEFAULT_RECENT_LIMIT = 25;
const DEFAULT_POLL_INTERVAL_MS = 60_000;

const WINDOW_OPTIONS = [
  { value: "7", label: "7 days" },
  { value: "14", label: "14 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
] as const;

const DESIGNATION_OPTIONS = [
  { value: "all", label: "All designations" },
  { value: "commercial", label: "Commercial only" },
  { value: "residential", label: "Residential only" },
] as const;

const DEFAULT_FILTERS: FilterState = {
  windowDays: "30",
  permitType: "all",
  designation: "all",
  zip: "all",
};

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const compactCurrencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

function formatCurrency(value: number | null, compact = false): string {
  if (value === null || !Number.isFinite(value)) {
    return "—";
  }

  return compact
    ? compactCurrencyFormatter.format(value)
    : currencyFormatter.format(value);
}

function formatDateLabel(value: string | null): string {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }

  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatShortDateLabel(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatRelativeTime(value: string | null): string {
  if (!value) {
    return "Awaiting feed";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Awaiting feed";
  }

  const diffMs = Date.now() - parsed.getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60_000));

  if (diffMinutes < 1) {
    return "Updated just now";
  }

  if (diffMinutes < 60) {
    return `Updated ${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `Updated ${diffHours}h ago`;
  }

  return `Updated ${Math.floor(diffHours / 24)}d ago`;
}

function formatTooltipValue(
  value: number | string | undefined,
  name: string | undefined,
): [string, string] {
  const normalizedValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : 0;
  const safeValue = Number.isFinite(normalizedValue) ? normalizedValue : 0;

  if (name === "count") {
    return [numberFormatter.format(safeValue), "Permits"];
  }

  return [formatCurrency(safeValue), "Declared value"];
}

function normalizePermitRecord(
  permit: BuildingPermitRecord,
  index: number,
): PermitTableRecord {
  const permitNumber = permit.permitNumber?.trim() || `Unknown-${index + 1}`;

  return {
    id: `${permitNumber}-${permit.issuedDate ?? index}`,
    permitNumber,
    permitType: permit.permitType?.trim() || "Unknown",
    designation: permit.designation?.trim() || "Unspecified",
    projectDescription:
      permit.projectDescription?.trim() || "No project description provided",
    projectValue: Number.isFinite(permit.projectValue) ? permit.projectValue : 0,
    permitFee: Number.isFinite(permit.permitFee) ? permit.permitFee : 0,
    issuedDate: permit.issuedDate,
    address: permit.address?.trim() || "Address unavailable",
    zip: permit.zip?.trim() || "—",
    ownerName: permit.ownerName?.trim() || "Not listed",
    applicantName: permit.applicantName?.trim() || "Not listed",
    contractorName: permit.contractorName?.trim() || "Not listed",
  };
}

function matchesSearch(permit: PermitTableRecord, search: string): boolean {
  if (!search) {
    return true;
  }

  const haystack = [
    permit.permitNumber,
    permit.permitType,
    permit.designation,
    permit.projectDescription,
    permit.address,
    permit.zip,
    permit.ownerName,
    permit.applicantName,
    permit.contractorName,
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(search);
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter((value) => value.length > 0 && value !== "Unknown" && value !== "—"),
    ),
  ).sort((left, right) => left.localeCompare(right));
}

async function fetcher(url: string): Promise<BuildingPermitsFeedResponse> {
  const response = await fetch(url, {
    credentials: "include",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    const error = new Error(payload?.error ?? "Failed to load building permits");
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }

  return (await response.json()) as BuildingPermitsFeedResponse;
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Card className="border-primary/15 bg-gradient-to-br from-primary/10 via-background to-emerald-500/10">
        <CardContent className="flex flex-col gap-4 p-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-10 w-72" />
            <Skeleton className="h-4 w-[28rem]" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-6 w-28 rounded-full" />
            <Skeleton className="h-6 w-32 rounded-full" />
            <Skeleton className="h-10 w-28 rounded-md" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="grid gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-10" />
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-32" />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.8fr_1fr]">
        <Skeleton className="h-[26rem]" />
        <div className="grid gap-4">
          <Skeleton className="h-[12.5rem]" />
          <Skeleton className="h-[12.5rem]" />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <Skeleton className="h-[30rem]" />
        <Skeleton className="h-[30rem]" />
      </div>
    </div>
  );
}

function ChartEmptyState({
  title,
  detail,
}: {
  title: string;
  detail: string;
}) {
  return (
    <div className="flex h-[220px] items-center justify-center rounded-lg border border-dashed">
      <p className="max-w-xs text-center text-sm text-muted-foreground">
        {title} is empty for the current filter set. {detail}
      </p>
    </div>
  );
}

function EmptyTableState() {
  return (
    <div className="flex h-48 items-center justify-center rounded-lg border border-dashed">
      <p className="max-w-sm text-center text-sm text-muted-foreground">
        No permits match the current visible-row filters. Clear the search box or
        widen the live feed filters to inspect more activity.
      </p>
    </div>
  );
}

type BuildingPermitsDashboardProps = {
  embedded?: boolean;
};

export function BuildingPermitsDashboard({
  embedded = false,
}: BuildingPermitsDashboardProps) {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [searchInput, setSearchInput] = useState("");
  const normalizedSearchInput = searchInput.trim().toLowerCase();
  const deferredSearch = useDeferredValue(normalizedSearchInput);
  const [isTransitionPending, startTransition] = useTransition();

  const activeFilterCount =
    (filters.permitType !== "all" ? 1 : 0) +
    (filters.designation !== "all" ? 1 : 0) +
    (filters.zip !== "all" ? 1 : 0) +
    (deferredSearch.length > 0 ? 1 : 0);

  const requestParams = new URLSearchParams({
    days: filters.windowDays,
    designation: filters.designation,
    limit: String(DEFAULT_RECENT_LIMIT),
  });

  if (filters.permitType !== "all") {
    requestParams.set("permitType", filters.permitType);
  }

  if (filters.zip !== "all") {
    requestParams.set("zip", filters.zip);
  }

  const requestUrl = `/api/market/building-permits?${requestParams.toString()}`;

  const {
    data,
    error,
    isLoading,
    isValidating,
    mutate,
  } = useSWR<BuildingPermitsFeedResponse>(requestUrl, fetcher, {
    refreshInterval: DEFAULT_POLL_INTERVAL_MS,
    revalidateOnFocus: false,
    keepPreviousData: true,
    dedupingInterval: 15_000,
  });

  const recentPermits = (data?.recentPermits ?? []).map(normalizePermitRecord);
  const visiblePermits = deferredSearch
    ? recentPermits.filter((permit) => matchesSearch(permit, deferredSearch))
    : recentPermits;
  const highestValuePermits = [...visiblePermits]
    .filter((permit) => permit.projectValue > 0)
    .sort((left, right) => right.projectValue - left.projectValue)
    .slice(0, 5);

  const permitTypeOptions = uniqueSorted([
    ...(data?.topPermitTypes ?? []).map((item) => item.label),
    ...recentPermits.map((permit) => permit.permitType),
  ]);
  const zipOptions = uniqueSorted([
    ...(data?.topZipCodes ?? []).map((item) => item.label),
    ...recentPermits.map((permit) => permit.zip),
  ]);
  const designationOptions = uniqueSorted([
    ...(data?.designationBreakdown ?? []).map((item) => item.label),
  ]);

  const dailyIssued: ChartPoint[] = (data?.issuedTrend ?? []).map((point) => ({
    label: formatShortDateLabel(point.issuedDay),
    count: point.permitCount,
    totalValue: point.totalProjectValue,
  }));

  const permitTypeBreakdown: ChartPoint[] = (data?.topPermitTypes ?? []).map(
    (item) => ({
      label: item.label,
      count: item.permitCount,
      totalValue: item.totalProjectValue,
    }),
  );

  const topZipCodes: ChartPoint[] = (data?.topZipCodes ?? []).map((item) => ({
    label: item.label,
    count: item.permitCount,
    totalValue: item.totalProjectValue,
  }));

  const isBusy =
    isValidating ||
    isTransitionPending ||
    deferredSearch !== normalizedSearchInput;
  const errorStatus = (error as (Error & { status?: number }) | undefined)?.status;

  return (
    <div className="space-y-6">
        <Card className="border-primary/15 bg-gradient-to-br from-primary/10 via-background to-emerald-500/10">
          <CardContent className="flex flex-col gap-6 p-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="gap-1.5">
                  <Activity className="h-3.5 w-3.5" />
                  Live BRLA feed
                </Badge>
                <Badge variant="outline">
                  Dataset {data?.dataset.id ?? "7fq7-8j7r"}
                </Badge>
                <Badge variant="outline">
                  Auto-refresh every {Math.round(DEFAULT_POLL_INTERVAL_MS / 1000)}s
                </Badge>
              </div>

              <div className="space-y-1">
                <h1
                  className={
                    embedded
                      ? "text-2xl font-semibold tracking-tight"
                      : "text-3xl font-semibold tracking-tight"
                  }
                >
                  East Baton Rouge Building Permits
                </h1>
                <p className="max-w-3xl text-sm text-muted-foreground">
                  Constant live feed for the BRLA permits dataset with current
                  issuance velocity, permit-type mix, ZIP concentration, and
                  the latest rows in a searchable table.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span>{formatRelativeTime(data?.dataset.refreshedAt ?? null)}</span>
                <span className="hidden md:inline">•</span>
                <span>
                  Latest issued {formatDateLabel(data?.totals.latestIssuedDate ?? null)}
                </span>
                <span className="hidden md:inline">•</span>
                <span>
                  Window: last {data?.filters.days ?? Number(filters.windowDays)} days
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant="outline">
                <Link href={data?.dataset.sourceUrl ?? "https://data.brla.gov/Housing-and-Development/EBR-Building-Permits/7fq7-8j7r/about_data"} target="_blank" rel="noreferrer">
                  Source dataset
                </Link>
              </Button>
              {!embedded ? (
                <Button asChild variant="outline">
                  <Link href="/market">Back to Market Intel</Link>
                </Button>
              ) : null}
              <Button
                onClick={() => void mutate()}
                disabled={isValidating}
                className="gap-2"
              >
                <RefreshCw className={isValidating ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
                Refresh now
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base">Live feed filters</CardTitle>
                <CardDescription>
                  Window, designation, permit type, and ZIP update the live
                  feed query. Free-text search narrows only the visible rows
                  table and high-value cards.
                </CardDescription>
              </div>

              <div className="flex items-center gap-2">
                <Badge variant="outline" className="gap-1.5">
                  <Filter className="h-3.5 w-3.5" />
                  {activeFilterCount} active
                </Badge>
                {isBusy ? (
                  <Badge variant="secondary" className="gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Syncing
                  </Badge>
                ) : null}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    startTransition(() => {
                      setFilters(DEFAULT_FILTERS);
                      setSearchInput("");
                    });
                  }}
                >
                  Clear filters
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="grid gap-3 xl:grid-cols-[1.3fr_repeat(4,minmax(0,1fr))]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search permit number, address, contractor, or owner"
                className="pl-9"
              />
            </div>

            <Select
              value={filters.windowDays}
              onValueChange={(value) =>
                startTransition(() =>
                  setFilters((current) => ({ ...current, windowDays: value })),
                )
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Window" />
              </SelectTrigger>
              <SelectContent>
                {WINDOW_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filters.permitType}
              onValueChange={(value) =>
                startTransition(() =>
                  setFilters((current) => ({ ...current, permitType: value })),
                )
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Permit type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All permit types</SelectItem>
                {permitTypeOptions.map((permitType) => (
                  <SelectItem key={permitType} value={permitType}>
                    {permitType}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filters.designation}
              onValueChange={(value: BuildingPermitsDesignation) =>
                startTransition(() =>
                  setFilters((current) => ({ ...current, designation: value })),
                )
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Designation" />
              </SelectTrigger>
              <SelectContent>
                {DESIGNATION_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filters.zip}
              onValueChange={(value) =>
                startTransition(() =>
                  setFilters((current) => ({ ...current, zip: value })),
                )
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="ZIP code" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All ZIPs</SelectItem>
                {zipOptions.map((zipCode) => (
                  <SelectItem key={zipCode} value={zipCode}>
                    {zipCode}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>

          {designationOptions.length > 0 ? (
            <CardContent className="pt-0">
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                {designationOptions.map((designation) => (
                  <Badge key={designation} variant="secondary">
                    {designation}
                  </Badge>
                ))}
              </div>
            </CardContent>
          ) : null}
        </Card>

        {isLoading && !data ? (
          <DashboardSkeleton />
        ) : error ? (
          <Card className="border-destructive/40">
            <CardHeader>
              <CardTitle className="text-base">Permits feed unavailable</CardTitle>
              <CardDescription>
                {errorStatus === 401 || errorStatus === 403
                  ? "Your session does not currently have access to the permits feed. Re-authenticate or confirm org membership."
                  : "The dashboard is ready, but the live permits endpoint did not return data for this request."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span>{error.message}</span>
              <Button variant="outline" size="sm" onClick={() => void mutate()}>
                Retry request
              </Button>
            </CardContent>
          </Card>
        ) : data ? (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <MetricCard
                label="Permits in window"
                value={numberFormatter.format(data.totals.permitCount)}
                subtitle={`Last ${data.filters.days} days`}
                icon={FileText}
              />
              <MetricCard
                label="Declared value"
                value={formatCurrency(data.totals.totalProjectValue, true)}
                subtitle="Summed project value"
                icon={Landmark}
              />
              <MetricCard
                label="Average permit"
                value={formatCurrency(data.totals.averageProjectValue, true)}
                subtitle="Mean declared value"
                icon={BarChart3}
              />
              <MetricCard
                label="Permit fees"
                value={formatCurrency(data.totals.totalPermitFees, true)}
                subtitle="Total fees in window"
                icon={Activity}
              />
              <MetricCard
                label="Latest issue date"
                value={formatDateLabel(data.totals.latestIssuedDate)}
                subtitle={formatRelativeTime(data.dataset.refreshedAt)}
                icon={Clock3}
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.8fr_1fr]">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Daily issuance velocity</CardTitle>
                  <CardDescription>
                    Permit count over time for the current live filter set.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {dailyIssued.length === 0 ? (
                    <ChartEmptyState
                      title="Daily permit activity"
                      detail="Try a wider date window."
                    />
                  ) : (
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={dailyIssued}
                          margin={{ top: 12, right: 8, left: -18, bottom: 0 }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            vertical={false}
                            className="stroke-border/70"
                          />
                          <XAxis
                            dataKey="label"
                            tickLine={false}
                            axisLine={false}
                            fontSize={12}
                          />
                          <YAxis
                            allowDecimals={false}
                            tickLine={false}
                            axisLine={false}
                            width={36}
                            fontSize={12}
                          />
                          <Tooltip
                            cursor={{ fill: "rgba(148, 163, 184, 0.08)" }}
                            formatter={formatTooltipValue}
                          />
                          <Bar
                            dataKey="count"
                            fill="hsl(var(--primary))"
                            radius={[6, 6, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="grid gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Permit type mix</CardTitle>
                    <CardDescription>
                      Highest-volume permit categories in the live feed.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {permitTypeBreakdown.length === 0 ? (
                      <ChartEmptyState
                        title="Permit type mix"
                        detail="Clear the permit-type filter."
                      />
                    ) : (
                      <div className="h-[220px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={permitTypeBreakdown}
                            layout="vertical"
                            margin={{ top: 0, right: 8, left: 24, bottom: 0 }}
                          >
                            <CartesianGrid
                              strokeDasharray="3 3"
                              horizontal={false}
                              className="stroke-border/70"
                            />
                            <XAxis
                              type="number"
                              allowDecimals={false}
                              tickLine={false}
                              axisLine={false}
                              fontSize={12}
                            />
                            <YAxis
                              type="category"
                              dataKey="label"
                              tickLine={false}
                              axisLine={false}
                              width={116}
                              fontSize={12}
                            />
                            <Tooltip formatter={formatTooltipValue} />
                            <Bar
                              dataKey="count"
                              fill="#0f766e"
                              radius={[0, 6, 6, 0]}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Top ZIP concentration</CardTitle>
                    <CardDescription>
                      Where current issuance activity is clustering.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {topZipCodes.length === 0 ? (
                      <ChartEmptyState
                        title="ZIP-level concentration"
                        detail="Clear the ZIP filter."
                      />
                    ) : (
                      <div className="space-y-3">
                        {topZipCodes.map((zipCode) => {
                          const maxCount = Math.max(
                            ...topZipCodes.map((item) => item.count),
                            1,
                          );
                          const width = (zipCode.count / maxCount) * 100;

                          return (
                            <div key={zipCode.label} className="space-y-1.5">
                              <div className="flex items-center justify-between text-sm">
                                <span className="font-medium">{zipCode.label}</span>
                                <span className="text-muted-foreground">
                                  {numberFormatter.format(zipCode.count)} permits
                                </span>
                              </div>
                              <div className="h-2 rounded-full bg-muted">
                                <div
                                  className="h-2 rounded-full bg-sky-500 transition-all"
                                  style={{ width: `${width}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">Recent permits</CardTitle>
                      <CardDescription>
                        Latest East Baton Rouge permit rows from the live feed.
                      </CardDescription>
                    </div>
                    <Badge variant="outline">
                      {numberFormatter.format(visiblePermits.length)} rows shown
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {visiblePermits.length === 0 ? (
                    <EmptyTableState />
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="min-w-[118px]">Issued</TableHead>
                          <TableHead className="min-w-[136px]">Permit</TableHead>
                          <TableHead className="min-w-[150px]">Type</TableHead>
                          <TableHead className="hidden min-w-[120px] lg:table-cell">
                            Designation
                          </TableHead>
                          <TableHead className="min-w-[220px]">
                            Address / Scope
                          </TableHead>
                          <TableHead className="hidden min-w-[150px] xl:table-cell">
                            Contractor
                          </TableHead>
                          <TableHead className="text-right">Value</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {visiblePermits.map((permit) => (
                          <TableRow key={permit.id}>
                            <TableCell className="align-top">
                              <div className="space-y-1">
                                <div className="font-medium">
                                  {formatDateLabel(permit.issuedDate)}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  Fee {formatCurrency(permit.permitFee)}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="align-top">
                              <div className="space-y-1">
                                <div className="font-medium">
                                  {permit.permitNumber}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  Owner: {permit.ownerName}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="align-top">
                              <Badge variant="secondary" className="max-w-full truncate">
                                {permit.permitType}
                              </Badge>
                            </TableCell>
                            <TableCell className="hidden align-top lg:table-cell">
                              <Badge variant="outline" className="max-w-full truncate">
                                {permit.designation}
                              </Badge>
                            </TableCell>
                            <TableCell className="align-top">
                              <div className="space-y-1">
                                <div className="font-medium">{permit.address}</div>
                                <div className="line-clamp-2 text-xs text-muted-foreground">
                                  {permit.projectDescription}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  ZIP {permit.zip}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="hidden align-top xl:table-cell">
                              <div className="space-y-1">
                                <div className="line-clamp-2 text-sm text-muted-foreground">
                                  {permit.contractorName}
                                </div>
                                <div className="line-clamp-1 text-xs text-muted-foreground">
                                  Applicant: {permit.applicantName}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-right align-top font-semibold">
                              {formatCurrency(permit.projectValue)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Largest declared values</CardTitle>
                  <CardDescription>
                    Highest-value permits returned by the current live filter set.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {highestValuePermits.length === 0 ? (
                    <EmptyTableState />
                  ) : (
                    <div className="space-y-3">
                      {highestValuePermits.map((permit) => (
                        <div key={`${permit.id}-value`} className="rounded-lg border p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 space-y-1">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline">{permit.permitType}</Badge>
                                <span className="text-xs text-muted-foreground">
                                  {formatDateLabel(permit.issuedDate)}
                                </span>
                              </div>
                              <p className="truncate text-sm font-medium">
                                {permit.address}
                              </p>
                              <p className="line-clamp-2 text-xs text-muted-foreground">
                                {permit.projectDescription}
                              </p>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="text-sm font-semibold">
                                {formatCurrency(permit.projectValue)}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {permit.permitNumber}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        ) : null}
      </div>
  );
}
