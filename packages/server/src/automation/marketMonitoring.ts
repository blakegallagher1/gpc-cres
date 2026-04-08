import { prisma } from "@entitlement-os/db";
import { AUTOMATION_CONFIG } from "./config";
import { createAutomationTask } from "./notifications";

type ActiveDeal = {
  id: string;
  orgId: string;
  name: string;
  jurisdiction: {
    name: string;
  } | null;
};

type WindowMetrics = {
  capRate: number | null;
  absorption: number | null;
};

export type MarketMonitoringParishResult = {
  parish: string;
  activeDealCount: number;
  capRateDeltaBps: number | null;
  absorptionDelta: number | null;
  capRateAlertTriggered: boolean;
};

export type MarketMonitoringResult = {
  parishesScanned: number;
  activeDealsScanned: number;
  capRateAlertsCreated: number;
  dscrAlertsCreated: number;
  portfolioRateShiftBps: number | null;
  parishResults: MarketMonitoringParishResult[];
};

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toDecimalRate(value: number): number {
  return value > 1 ? value / 100 : value;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function extractCapRate(data: Record<string, unknown>): number | null {
  const raw = asNumber(data.cap_rate ?? data.capRate ?? data.market_cap_rate);
  return raw === null ? null : toDecimalRate(raw);
}

function extractAbsorption(data: Record<string, unknown>): number | null {
  const raw = asNumber(
    data.absorption ??
      data.net_absorption ??
      data.absorption_rate ??
      data.absorptionRate,
  );
  return raw === null ? null : raw;
}

function computeDeltaBps(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null;
  return Math.round((current - previous) * 10_000);
}

function computeDelta(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null;
  return current - previous;
}

async function hasRecentTask(
  orgId: string,
  dealId: string,
  marker: string,
): Promise<boolean> {
  const cutoff = new Date(
    Date.now() - AUTOMATION_CONFIG.marketMonitoring.dedupeWindowHours * 60 * 60 * 1000,
  );
  const existing = await prisma.task.findFirst({
    where: {
      orgId,
      dealId,
      createdAt: { gte: cutoff },
      title: { contains: marker, mode: "insensitive" },
    },
    select: { id: true },
  });
  return existing !== null;
}

async function loadWindowMetrics(
  parish: string,
  from: Date,
  to: Date,
): Promise<WindowMetrics> {
  const points = await prisma.marketDataPoint.findMany({
    where: {
      parish: { equals: parish, mode: "insensitive" },
      observedAt: {
        gte: from,
        lt: to,
      },
    },
    select: {
      data: true,
    },
  });

  const capRates: number[] = [];
  const absorptionValues: number[] = [];

  for (const point of points) {
    const payload =
      point.data && typeof point.data === "object"
        ? (point.data as Record<string, unknown>)
        : {};
    const capRate = extractCapRate(payload);
    const absorption = extractAbsorption(payload);
    if (capRate !== null) capRates.push(capRate);
    if (absorption !== null) absorptionValues.push(absorption);
  }

  return {
    capRate: average(capRates),
    absorption: average(absorptionValues),
  };
}

async function createCapRateShiftTasks(
  deals: ActiveDeal[],
  parish: string,
  capRateDeltaBps: number,
): Promise<number> {
  let created = 0;

  for (const deal of deals) {
    const marker = `cap rate moved ${parish}`;
    if (await hasRecentTask(deal.orgId, deal.id, marker)) {
      continue;
    }

    await createAutomationTask({
      orgId: deal.orgId,
      dealId: deal.id,
      type: "enrichment_review",
      title: `Market cap rate moved ${parish} ${capRateDeltaBps > 0 ? "+" : ""}${capRateDeltaBps} bps`,
      description:
        `${parish} cap rates shifted ${capRateDeltaBps > 0 ? "+" : ""}${capRateDeltaBps} bps ` +
        "over the last 30 days versus the prior 30-day baseline. Re-underwrite assumptions.",
      pipelineStep: 2,
    });
    created += 1;
  }

  return created;
}

async function createDscrRecalcTasks(
  deals: ActiveDeal[],
  portfolioShiftBps: number,
): Promise<number> {
  let created = 0;

  for (const deal of deals) {
    const marker = "dscr recalculation required";
    if (await hasRecentTask(deal.orgId, deal.id, marker)) {
      continue;
    }

    await createAutomationTask({
      orgId: deal.orgId,
      dealId: deal.id,
      type: "enrichment_review",
      title: "DSCR recalculation required",
      description:
        `Portfolio-wide rate environment shifted ${portfolioShiftBps > 0 ? "+" : ""}${portfolioShiftBps} bps ` +
        "versus the prior baseline window. Recalculate DSCR and debt sizing assumptions.",
      pipelineStep: 2,
    });
    created += 1;
  }

  return created;
}

export async function runMarketMonitoring(now = new Date()): Promise<MarketMonitoringResult> {
  const activeDeals = await prisma.deal.findMany({
    where: {
      status: { notIn: ["KILLED", "EXITED"] },
    },
    select: {
      id: true,
      orgId: true,
      name: true,
      jurisdiction: {
        select: {
          name: true,
        },
      },
    },
  });

  const dealsByParish = new Map<string, ActiveDeal[]>();
  for (const deal of activeDeals) {
    const parish = deal.jurisdiction?.name?.trim();
    if (!parish) continue;
    const list = dealsByParish.get(parish) ?? [];
    list.push(deal);
    dealsByParish.set(parish, list);
  }

  const currentWindowStart = new Date(now.getTime() - AUTOMATION_CONFIG.marketMonitoring.lookbackDays * 24 * 60 * 60 * 1000);
  const baselineWindowStart = new Date(currentWindowStart.getTime() - AUTOMATION_CONFIG.marketMonitoring.lookbackDays * 24 * 60 * 60 * 1000);

  const parishResults: MarketMonitoringParishResult[] = [];
  const capRateDeltas: number[] = [];
  let capRateAlertsCreated = 0;

  for (const [parish, parishDeals] of dealsByParish.entries()) {
    const [current, baseline] = await Promise.all([
      loadWindowMetrics(parish, currentWindowStart, now),
      loadWindowMetrics(parish, baselineWindowStart, currentWindowStart),
    ]);

    const capRateDeltaBps = computeDeltaBps(current.capRate, baseline.capRate);
    const absorptionDelta = computeDelta(current.absorption, baseline.absorption);

    let capRateAlertTriggered = false;
    if (
      capRateDeltaBps !== null &&
      Math.abs(capRateDeltaBps) >= AUTOMATION_CONFIG.marketMonitoring.capRateShiftBps
    ) {
      capRateAlertTriggered = true;
      capRateAlertsCreated += await createCapRateShiftTasks(
        parishDeals,
        parish,
        capRateDeltaBps,
      );
      capRateDeltas.push(capRateDeltaBps);
    } else if (capRateDeltaBps !== null) {
      capRateDeltas.push(capRateDeltaBps);
    }

    parishResults.push({
      parish,
      activeDealCount: parishDeals.length,
      capRateDeltaBps,
      absorptionDelta,
      capRateAlertTriggered,
    });
  }

  const portfolioRateShiftBps = average(capRateDeltas);
  const roundedPortfolioShiftBps =
    portfolioRateShiftBps === null ? null : Math.round(portfolioRateShiftBps);

  let dscrAlertsCreated = 0;
  if (
    roundedPortfolioShiftBps !== null &&
    Math.abs(roundedPortfolioShiftBps) >= AUTOMATION_CONFIG.marketMonitoring.rateEnvironmentShiftBps
  ) {
    dscrAlertsCreated = await createDscrRecalcTasks(activeDeals, roundedPortfolioShiftBps);
  }

  return {
    parishesScanned: parishResults.length,
    activeDealsScanned: activeDeals.length,
    capRateAlertsCreated,
    dscrAlertsCreated,
    portfolioRateShiftBps: roundedPortfolioShiftBps,
    parishResults,
  };
}
