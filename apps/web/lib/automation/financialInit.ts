import { prisma, type Prisma } from "@entitlement-os/db";
import type { AutomationEvent } from "./events";
import { AUTOMATION_CONFIG } from "./config";
import {
  DEFAULT_ASSUMPTIONS,
  type FinancialModelAssumptions,
} from "@/stores/financialModelStore";

type DecimalLike = { toString(): string };

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (
    value &&
    typeof value === "object" &&
    "toString" in value &&
    typeof (value as DecimalLike).toString === "function"
  ) {
    const parsed = Number((value as DecimalLike).toString());
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function percentFromUnknown(value: unknown): number | null {
  const num = toNumber(value);
  if (num === null) return null;
  return num > 1 ? num : num * 100;
}

function extractTargetIrrPct(runOutput: Record<string, unknown> | null): number | null {
  if (!runOutput) return null;
  const triage =
    runOutput.triage && typeof runOutput.triage === "object"
      ? (runOutput.triage as Record<string, unknown>)
      : runOutput;

  const financialSummary =
    triage.financial_summary && typeof triage.financial_summary === "object"
      ? (triage.financial_summary as Record<string, unknown>)
      : null;

  return (
    percentFromUnknown(triage.target_irr) ??
    percentFromUnknown(triage.predicted_irr) ??
    percentFromUnknown(financialSummary?.target_irr) ??
    percentFromUnknown(financialSummary?.estimated_irr) ??
    null
  );
}

function normalizeCapRatePct(value: number): number {
  return value > 1 ? value : value * 100;
}

async function getMarketExitCapRatePct(
  parish: string | null | undefined,
): Promise<number> {
  if (!parish) {
    return AUTOMATION_CONFIG.financialInit.defaultExitCapRatePct;
  }

  const lookbackSince = new Date(
    Date.now() -
      AUTOMATION_CONFIG.financialInit.marketCapRateLookbackDays *
        24 *
        60 *
        60 *
        1000,
  );

  const points = await prisma.marketDataPoint.findMany({
    where: {
      parish: { equals: parish, mode: "insensitive" },
      observedAt: { gte: lookbackSince },
      dataType: "comp_sale",
    },
    select: { data: true },
  });

  const capRates: number[] = [];
  for (const point of points) {
    const data =
      point.data && typeof point.data === "object"
        ? (point.data as Record<string, unknown>)
        : {};
    const capRate =
      toNumber(data.cap_rate) ??
      toNumber(data.capRate) ??
      toNumber(data.market_cap_rate);
    if (capRate !== null) {
      capRates.push(normalizeCapRatePct(capRate));
    }
  }

  if (capRates.length === 0) {
    return AUTOMATION_CONFIG.financialInit.defaultExitCapRatePct;
  }

  const avg = capRates.reduce((sum, value) => sum + value, 0) / capRates.length;
  return Math.round(avg * 100) / 100;
}

/**
 * E1: Auto-initialize financial model assumptions after triage completes.
 * Only initializes when assumptions are currently null.
 */
export async function handleFinancialInit(event: AutomationEvent): Promise<void> {
  if (event.type !== "triage.completed") return;

  const deal = await prisma.deal.findFirst({
    where: { id: event.dealId, orgId: event.orgId },
    select: {
      id: true,
      orgId: true,
      sku: true,
      financialModelAssumptions: true,
      jurisdiction: { select: { name: true } },
      parcels: { select: { acreage: true } },
      terms: { select: { offerPrice: true } },
    },
  });

  if (!deal) return;
  if (deal.financialModelAssumptions !== null) return;

  const acreage = deal.parcels.reduce((sum, parcel) => {
    const val = toNumber(parcel.acreage);
    return sum + (val ?? 0);
  }, 0);

  const coverageRatio =
    AUTOMATION_CONFIG.financialInit.coverageRatioBySku[
      deal.sku as keyof typeof AUTOMATION_CONFIG.financialInit.coverageRatioBySku
    ] ?? AUTOMATION_CONFIG.financialInit.defaultCoverageRatio;

  const buildableSf = Math.max(Math.round(acreage * 43_560 * coverageRatio), 5_000);
  const marketExitCapRate = await getMarketExitCapRatePct(deal.jurisdiction?.name);

  const triageRun = await prisma.run.findFirst({
    where: {
      id: event.runId,
      orgId: event.orgId,
      dealId: event.dealId,
      runType: "TRIAGE",
    },
    select: { outputJson: true },
  });

  const runOutput =
    triageRun?.outputJson && typeof triageRun.outputJson === "object"
      ? (triageRun.outputJson as Record<string, unknown>)
      : null;
  const targetIrrPct = extractTargetIrrPct(runOutput);
  const offerPrice = toNumber(deal.terms?.offerPrice);

  const assumptions: FinancialModelAssumptions & {
    targetIrrPct?: number;
    initializationMetadata?: Record<string, unknown>;
  } = {
    ...DEFAULT_ASSUMPTIONS,
    acquisition: {
      ...DEFAULT_ASSUMPTIONS.acquisition,
      purchasePrice: offerPrice ?? DEFAULT_ASSUMPTIONS.acquisition.purchasePrice,
    },
    exit: {
      ...DEFAULT_ASSUMPTIONS.exit,
      holdYears: AUTOMATION_CONFIG.financialInit.defaultHoldYears,
      exitCapRate: marketExitCapRate,
    },
    buildableSf,
  };

  if (targetIrrPct !== null) {
    assumptions.targetIrrPct = Math.round(targetIrrPct * 100) / 100;
  }

  assumptions.initializationMetadata = {
    sourceEvent: "triage.completed",
    sourceRunId: event.runId,
    initializedAt: new Date().toISOString(),
    acreage,
    coverageRatio,
    marketExitCapRate,
  };

  await prisma.deal.update({
    where: { id: deal.id },
    data: { financialModelAssumptions: assumptions as unknown as Prisma.InputJsonValue },
  });
}
