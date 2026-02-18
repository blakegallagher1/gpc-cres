import { Suspense } from "react";
import { headers } from "next/headers";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Skeleton } from "@/components/ui/skeleton";
import { SkuType } from "@/lib/data/portfolioConstants";
import type {
  PortfolioSummary,
  ConcentrationAnalysis,
  DebtMaturityWall as DebtMaturityWallData,
  DealVelocityAnalytics,
  CapitalDeploymentAnalytics,
} from "@/lib/services/portfolioAnalytics.service";
import PortfolioPage from "./page-client";

type SearchParams = Record<string, string | string[] | undefined>;

type PortfolioPayload = {
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
};

type OutcomeSummary = {
  totalExited: number;
  totalKilled: number;
  avgIrr: number | null;
  avgEquityMultiple: number | null;
  avgHoldMonths: number | null;
  topBiases: {
    assumptionName: string;
    avgProjected: number;
    avgActual: number;
    avgVariancePct: number;
    sampleSize: number;
    direction: "over" | "under" | "neutral";
  }[];
  triageCalibration: {
    triageTier: string;
    totalDeals: number;
    exitedDeals: number;
    killedDeals: number;
    avgActualIrr: number | null;
    avgActualEquityMultiple: number | null;
    successRate: number;
  }[];
  predictionTracking: {
    avgIrrOverestimatePct: number | null;
    avgTimelineUnderestimateMonths: number | null;
    riskAccuracyScore: number | null;
    sampleSize: number;
  };
};

type BuyerDealSummary = {
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
};

type BuyersResponse = {
  buyers: Array<{
    id: string;
    name: string;
    company?: string | null;
    buyerType?: string | null;
    email?: string | null;
    phone?: string | null;
    deals?: BuyerDealSummary[];
  }>;
};

type PortfolioPageTab = "analytics" | "outcomes" | "buyers";

type PortfolioRouteProps = {
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

async function PortfolioAnalyticsSection({
  activeTab,
  portfolioPromise,
  analyticsPromise,
  concentrationPromise,
  debtMaturityPromise,
  velocityPromise,
  capitalDeploymentPromise,
}: {
  activeTab: PortfolioPageTab;
  portfolioPromise: Promise<PortfolioPayload>;
  analyticsPromise: Promise<PortfolioSummary>;
  concentrationPromise: Promise<ConcentrationAnalysis>;
  debtMaturityPromise: Promise<DebtMaturityWallData>;
  velocityPromise: Promise<DealVelocityAnalytics>;
  capitalDeploymentPromise: Promise<CapitalDeploymentAnalytics>;
}) {
  if (activeTab !== "analytics") {
    return null;
  }

  const [portfolio, analytics, concentration, debtMaturity, velocityMetrics, capitalDeployment] =
    await Promise.all([
      portfolioPromise,
      analyticsPromise,
      concentrationPromise,
      debtMaturityPromise,
      velocityPromise,
      capitalDeploymentPromise,
    ]);

  return (
    <PortfolioPage
      initialPortfolio={portfolio}
      initialAnalytics={analytics}
      initialConcentration={concentration}
      initialDebtMaturity={debtMaturity}
      initialVelocityMetrics={velocityMetrics}
      initialCapitalDeployment={capitalDeployment}
      initialActiveTab="analytics"
    />
  );
}

async function PortfolioOutcomesSection({
  activeTab,
  outcomePromise,
}: {
  activeTab: PortfolioPageTab;
  outcomePromise: Promise<OutcomeSummary>;
}) {
  if (activeTab !== "outcomes") {
    return null;
  }

  const outcomeSummary = await outcomePromise;

  return <PortfolioPage initialOutcomeSummary={outcomeSummary} initialActiveTab="outcomes" />;
}

async function PortfolioBuyersSection({
  activeTab,
  buyersPromise,
}: {
  activeTab: PortfolioPageTab;
  buyersPromise: Promise<BuyersResponse>;
}) {
  if (activeTab !== "buyers") {
    return null;
  }

  const buyersResponse = await buyersPromise;

  return <PortfolioPage initialBuyersResponse={buyersResponse} initialActiveTab="buyers" />;
}

function PortfolioFallback() {
  return (
    <DashboardShell>
      <div className="space-y-4 p-6">
        <div className="grid gap-3 sm:grid-cols-4">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-8 w-40" />
        </div>
        <Skeleton className="h-80 w-full" />
        <div className="grid gap-3 md:grid-cols-2">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    </DashboardShell>
  );
}

export default async function PortfolioRoute({ searchParams = {} }: PortfolioRouteProps) {
  const tab = getSearchParam(searchParams?.tab);
  const activeTab: PortfolioPageTab =
    tab === "outcomes" ? "outcomes" : tab === "buyers" ? "buyers" : "analytics";

  const baseUrl = await getApiBaseUrl();
  const cookie = await getCookieHeader();

  if (activeTab === "analytics") {
    const portfolioPromise = fetchJson<PortfolioPayload>(`${baseUrl}/api/portfolio`, cookie);
    const analyticsPromise = fetchJson<PortfolioSummary>(
      `${baseUrl}/api/portfolio/analytics`,
      cookie,
    );
    const concentrationPromise = fetchJson<ConcentrationAnalysis>(
      `${baseUrl}/api/portfolio/concentration`,
      cookie,
    );
    const debtMaturityPromise = fetchJson<DebtMaturityWallData>(
      `${baseUrl}/api/portfolio/debt-maturity`,
      cookie,
    );
    const velocityPromise = fetchJson<DealVelocityAnalytics>(
      `${baseUrl}/api/portfolio/velocity`,
      cookie,
    );
    const capitalDeploymentPromise = fetchJson<CapitalDeploymentAnalytics>(
      `${baseUrl}/api/portfolio/capital-deployment`,
      cookie,
    );

    return (
      <Suspense fallback={<PortfolioFallback />}>
        <PortfolioAnalyticsSection
          activeTab={activeTab}
          portfolioPromise={portfolioPromise}
          analyticsPromise={analyticsPromise}
          concentrationPromise={concentrationPromise}
          debtMaturityPromise={debtMaturityPromise}
          velocityPromise={velocityPromise}
          capitalDeploymentPromise={capitalDeploymentPromise}
        />
      </Suspense>
    );
  }

  if (activeTab === "outcomes") {
    const outcomePromise = fetchJson<OutcomeSummary>(
      `${baseUrl}/api/outcomes?view=summary`,
      cookie,
    );

    return (
      <Suspense fallback={<PortfolioFallback />}>
        <PortfolioOutcomesSection activeTab={activeTab} outcomePromise={outcomePromise} />
      </Suspense>
    );
  }

  const buyersPromise = fetchJson<BuyersResponse>(
    `${baseUrl}/api/buyers?withDeals=true`,
    cookie,
  );

  return (
    <Suspense fallback={<PortfolioFallback />}>
      <PortfolioBuyersSection activeTab={activeTab} buyersPromise={buyersPromise} />
    </Suspense>
  );
}
