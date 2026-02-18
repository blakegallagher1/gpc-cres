import { Suspense } from "react";
import { headers } from "next/headers";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Skeleton } from "@/components/ui/skeleton";
import type { DealSummary } from "@/components/deals/DealCard";
import DealsPage from "./page-client";

type SearchParams = Record<string, string | string[] | undefined>;

type DealsListResponse = {
  deals: DealSummary[];
};

type DealsRouteProps = {
  searchParams?: SearchParams;
};

function getSearchParam(value: string | string[] | undefined): string | undefined {
  if (typeof value === "undefined") {
    return undefined;
  }

  return Array.isArray(value) ? value[0] : value;
}

async function getApiBaseUrl() {
  const headerStore = await headers();
  const host =
    headerStore.get("x-forwarded-host") ??
    headerStore.get("host") ??
    "localhost:3000";
  const protocol = headerStore.get("x-forwarded-proto") ?? "http";
  return `${protocol}://${host}`;
}

async function getCookieHeader() {
  const headerStore = await headers();
  return headerStore.get("cookie") ?? undefined;
}

async function fetchJson<T>(url: string, cookie?: string): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    headers: cookie ? { cookie } : undefined,
  });

  if (!response.ok) {
    throw new Error(`Failed to load data from ${url}: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

async function DealsSection({
  dealsPromise,
  initialStatusFilter,
  initialSkuFilter,
  initialSearch,
  initialTriageMode,
}: {
  dealsPromise: Promise<DealsListResponse>;
  initialStatusFilter: string;
  initialSkuFilter: string;
  initialSearch: string;
  initialTriageMode: boolean;
}) {
  const data = await dealsPromise;

  return (
    <DealsPage
      initialDeals={data.deals}
      initialStatusFilter={initialStatusFilter}
      initialSkuFilter={initialSkuFilter}
      initialSearch={initialSearch}
      initialTriageMode={initialTriageMode}
    />
  );
}

function DealsFallback() {
  return (
    <DashboardShell>
      <div className="space-y-4 p-6">
        <div className="flex items-center justify-between gap-4">
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-9 w-40" />
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <Skeleton className="h-9 rounded-lg" />
          <Skeleton className="h-9 rounded-lg" />
          <Skeleton className="h-9 rounded-lg" />
          <Skeleton className="h-9 rounded-lg" />
        </div>

        <div className="rounded-lg border">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="grid grid-cols-4 gap-3 border-b px-4 py-3 last:border-b-0">
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-16" />
            </div>
          ))}
        </div>
      </div>
    </DashboardShell>
  );
}

export default async function DealsRoute({ searchParams = {} }: DealsRouteProps) {
  const statusFilter = getSearchParam(searchParams?.status) ?? "all";
  const skuFilter = getSearchParam(searchParams?.sku) ?? "all";
  const initialSearch = getSearchParam(searchParams?.search) ?? "";
  const triageMode = getSearchParam(searchParams?.view) === "triage";

  const query = new URLSearchParams();
  if (statusFilter !== "all") {
    query.set("status", statusFilter);
  }
  if (skuFilter !== "all") {
    query.set("sku", skuFilter);
  }
  const searchTerm = initialSearch.trim();
  if (searchTerm.length > 0) {
    query.set("search", searchTerm);
  }

  const baseUrl = await getApiBaseUrl();
  const cookie = await getCookieHeader();

  const dealsPromise = fetchJson<DealsListResponse>(
    `${baseUrl}/api/deals${query.toString() ? `?${query.toString()}` : ""}`,
    cookie,
  );

  return (
    <Suspense
      fallback={<DealsFallback />}
    >
      <DealsSection
        dealsPromise={dealsPromise}
        initialStatusFilter={statusFilter}
        initialSkuFilter={skuFilter}
        initialSearch={initialSearch}
        initialTriageMode={triageMode}
      />
    </Suspense>
  );
}
