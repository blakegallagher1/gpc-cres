import { Suspense } from "react";
import { headers } from "next/headers";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Skeleton } from "@/components/ui/skeleton";
import type { WorkflowRun } from "@/types";
import type { RunDashboardPayload } from "@/lib/hooks/useRunDashboard";
import RunsPage from "./page-client";

type SearchParams = Record<string, string | string[] | undefined>;

type RunsResponse = {
  runs: WorkflowRun[];
};

type RunsRouteProps = {
  searchParams?: SearchParams;
};

type RunsPageTab = "history" | "intelligence";

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

async function RunsHistorySection({
  activeTab,
  runsPromise,
}: {
  activeTab: RunsPageTab;
  runsPromise: Promise<RunsResponse>;
}) {
  if (activeTab !== "history") {
    return null;
  }

  const data = await runsPromise;

  return <RunsPage initialRuns={data.runs} initialActiveTab="history" />;
}

async function RunsIntelligenceSection({
  activeTab,
  dashboardPromise,
}: {
  activeTab: RunsPageTab;
  dashboardPromise: Promise<RunDashboardPayload>;
}) {
  if (activeTab !== "intelligence") {
    return null;
  }

  const dashboard = await dashboardPromise;

  return <RunsPage initialDashboard={dashboard} initialActiveTab="intelligence" />;
}

function RunsFallback() {
  return (
    <DashboardShell>
      <div className="space-y-4 p-6">
        <div className="flex gap-3">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 w-28" />
        </div>
        <div className="space-y-2">
          <div className="grid gap-3 sm:grid-cols-4">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
          <div className="overflow-hidden rounded-md border">
            <div className="divide-y">
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className="grid grid-cols-8 gap-4 px-4 py-3">
                  <Skeleton className="h-5 w-full" />
                  <Skeleton className="h-5 w-full" />
                  <Skeleton className="h-5 w-full" />
                  <Skeleton className="h-5 w-full" />
                  <Skeleton className="h-5 w-full" />
                  <Skeleton className="h-5 w-full" />
                  <Skeleton className="h-5 w-12" />
                  <Skeleton className="h-5 w-12" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}

export default async function RunsRoute({ searchParams = {} }: RunsRouteProps) {
  const activeTab = getSearchParam(searchParams?.tab) === "intelligence" ? "intelligence" : "history";

  const baseUrl = await getApiBaseUrl();
  const cookie = await getCookieHeader();

  if (activeTab === "history") {
    const runsPromise = fetchJson<RunsResponse>(`${baseUrl}/api/runs`, cookie);

    return (
      <Suspense fallback={<RunsFallback />}>
        <RunsHistorySection activeTab={activeTab} runsPromise={runsPromise} />
      </Suspense>
    );
  }

  const dashboardPromise = fetchJson<RunDashboardPayload>(
    `${baseUrl}/api/runs/dashboard`,
    cookie,
  );

  return (
    <Suspense fallback={<RunsFallback />}>
      <RunsIntelligenceSection activeTab={activeTab} dashboardPromise={dashboardPromise} />
    </Suspense>
  );
}
