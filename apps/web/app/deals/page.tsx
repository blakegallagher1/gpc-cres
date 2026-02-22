import { Suspense } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Skeleton } from "@/components/ui/skeleton";
import type { DealSummary } from "@/components/deals/DealCard";
import DealsPage from "./page-client";
import { resolveAuth } from "@/lib/auth/resolveAuth";

type SearchParams = Record<string, string | string[] | undefined>;

type DealsListResponse = {
  deals: DealSummary[];
};

type DealsRouteProps = {
  searchParams?: SearchParams | Promise<SearchParams>;
};

function getSearchParam(value: string | string[] | undefined): string | undefined {
  if (typeof value === "undefined") {
    return undefined;
  }

  return Array.isArray(value) ? value[0] : value;
}

const LOCAL_DEALS_API = "https://api.gallagherpropco.com";

async function fetchDealsFromLocalApi(
  orgId: string,
  query: URLSearchParams,
): Promise<DealsListResponse> {
  const apiKey = process.env.LOCAL_API_KEY?.trim();
  const baseUrl = process.env.LOCAL_API_URL?.trim() || LOCAL_DEALS_API;

  if (apiKey && baseUrl) {
    const url = `${baseUrl.replace(/\/$/, "")}/deals?org_id=${encodeURIComponent(orgId)}${query.toString() ? `&${query.toString()}` : ""}`;
    const response = await fetch(url, {
      cache: "no-store",
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Local API returned ${response.status}: ${text.slice(0, 200)}`);
    }
    return response.json() as Promise<DealsListResponse>;
  }

  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  const base = `${proto}://${host}`;
  const url = `${base}/api/deals?org_id=${encodeURIComponent(orgId)}${query.toString() ? `&${query.toString()}` : ""}`;
  const cookie = h.get("cookie");
  const response = await fetch(url, {
    cache: "no-store",
    headers: cookie ? { Cookie: cookie } : {},
  });
  if (!response.ok) {
    throw new Error(`Deals API returned ${response.status}`);
  }
  return response.json() as Promise<DealsListResponse>;
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

export default async function DealsRoute({ searchParams }: DealsRouteProps) {
  const auth = await resolveAuth();
  if (!auth) {
    redirect("/login");
  }

  const params = searchParams instanceof Promise ? await searchParams : searchParams ?? {};
  const statusFilter = getSearchParam(params?.status) ?? "all";
  const skuFilter = getSearchParam(params?.sku) ?? "all";
  const initialSearch = getSearchParam(params?.search) ?? "";
  const triageMode = getSearchParam(params?.view) === "triage";

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

  const dealsPromise = fetchDealsFromLocalApi(auth.orgId, query);

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
