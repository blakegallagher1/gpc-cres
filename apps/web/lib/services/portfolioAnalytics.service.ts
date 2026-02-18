import { prisma } from "@entitlement-os/db";
import { calculate1031Deadlines } from "@entitlement-os/shared";
import {
  computeProForma,
  type ProFormaResults,
} from "@/hooks/useProFormaCalculations";
import {
  DEFAULT_ASSUMPTIONS,
  type FinancialModelAssumptions,
} from "@/stores/financialModelStore";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PortfolioSummary {
  totalDeals: number;
  activeDeals: number;
  totalAcreage: number;
  totalEquityDeployed: number;
  weightedAvgIRR: number | null;
  weightedAvgCapRate: number | null;
  avgTriageScore: number | null;
  byStatus: Record<string, number>;
  bySku: Record<string, number>;
  byJurisdiction: Record<string, number>;
}

export interface ConcentrationBucket {
  name: string;
  count: number;
  pct: number;
  acreage: number;
}

export interface ConcentrationAnalysis {
  geographic: ConcentrationBucket[];
  sku: ConcentrationBucket[];
  vintageYear: ConcentrationBucket[];
  riskTier: ConcentrationBucket[];
  lender: ConcentrationBucket[];
  hhi: {
    parish: {
      value: number;
      band: "green" | "yellow" | "red";
      top3: ConcentrationBucket[];
    };
    sku: {
      value: number;
      band: "green" | "yellow" | "red";
      top3: ConcentrationBucket[];
    };
    lender: {
      value: number;
      band: "green" | "yellow" | "red";
      top3: ConcentrationBucket[];
    };
    hasAlert: boolean;
  };
}

export interface DebtMaturityQuarter {
  quarter: string;
  totalDebtMaturing: number;
  dealsAffected: number;
  refinanceRiskScore: number;
}

export interface DebtMaturityWall {
  totalPortfolioDebt: number;
  debtMaturing12Months: number;
  debtMaturing12MonthsPct: number;
  alert: boolean;
  quarters: DebtMaturityQuarter[];
}

export interface StageVelocityMetric {
  stage: string;
  avgDays: number;
  medianDays: number;
  p75Days: number;
  p90Days: number;
  sampleSize: number;
}

export interface StageKillRateMetric {
  stage: string;
  totalEntered: number;
  killedCount: number;
  killRatePct: number;
}

export interface FunnelLeakageMetric {
  stage: string;
  nextStage: string | null;
  enteredCount: number;
  advancedCount: number;
  droppedCount: number;
  dropOffPct: number;
}

export interface VelocityQuarterTrend {
  quarter: string;
  avgDays: number;
  medianDays: number;
  p75Days: number;
  p90Days: number;
  sampleSize: number;
  trend: "faster" | "slower" | "flat";
}

export interface DealVelocityAnalytics {
  stageDurations: StageVelocityMetric[];
  killRateByStage: StageKillRateMetric[];
  funnelLeakage: FunnelLeakageMetric[];
  quarterOverQuarter: VelocityQuarterTrend[];
}

export interface CapitalDeploymentStageMetric {
  stage: string;
  committed: number;
  deployed: number;
  nonRecoverable: number;
  efficiencyPct: number;
  entries: number;
}

export interface CapitalDeploymentAnalytics {
  totalCommitted: number;
  totalDeployed: number;
  totalNonRecoverable: number;
  costPerActiveParcel: number;
  costPerAcre: number;
  sunkCostKilledDeals: number;
  stageRollup: CapitalDeploymentStageMetric[];
}

export interface AllocationCandidate {
  dealId: string;
  dealName: string;
  sku: string;
  status: string;
  jurisdiction: string;
  acreage: number;
  triageScore: number | null;
  equityRequired: number;
  projectedIRR: number | null;
  riskAdjustedScore: number;
  recommended: boolean;
  allocationAmount: number;
}

export interface CapitalAllocationResult {
  availableEquity: number;
  allocatedEquity: number;
  unallocatedEquity: number;
  candidates: AllocationCandidate[];
}

export interface Match1031 {
  dealId: string;
  dealName: string;
  sku: string;
  status: string;
  jurisdiction: string;
  acreage: number;
  estimatedValue: number;
  identificationDeadline: string;
  closeDeadline: string;
  matchScore: number;
  matchReasons: string[];
}

export interface Match1031Result {
  dispositionDealId: string;
  dispositionDealName: string;
  estimatedSalePrice: number;
  identificationDeadline: string;
  closeDeadline: string;
  candidates: Match1031[];
}

export interface StressScenario {
  name: string;
  rateShockBps?: number;
  vacancySpikePct?: number;
  rentDeclinePct?: number;
  capRateExpansionBps?: number;
}

export interface StressResult {
  dealId: string;
  dealName: string;
  baseIRR: number | null;
  stressedIRR: number | null;
  baseDSCR: number;
  stressedDSCR: number;
  baseEquityMultiple: number;
  stressedEquityMultiple: number;
  irrChange: number | null;
  dscrChange: number;
  atRisk: boolean;
}

export interface PortfolioStressTestResult {
  scenario: StressScenario;
  results: StressResult[];
  portfolioBaseIRR: number | null;
  portfolioStressedIRR: number | null;
  dealsAtRisk: number;
  totalDeals: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface DealWithRelations {
  id: string;
  name: string;
  sku: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  jurisdiction: { name: string } | null;
  parcels: Array<{ acreage: { toString(): string } | null }>;
  terms: { closingDate: Date | null } | null;
  financialModelAssumptions: unknown;
}

function getDealAcreage(deal: DealWithRelations): number {
  return deal.parcels.reduce(
    (sum, p) => sum + (p.acreage ? Number(p.acreage.toString()) : 0),
    0
  );
}

function getDealAssumptions(
  deal: DealWithRelations,
  acreage: number
): FinancialModelAssumptions {
  if (
    deal.financialModelAssumptions &&
    typeof deal.financialModelAssumptions === "object"
  ) {
    return deal.financialModelAssumptions as FinancialModelAssumptions;
  }
  // Fall back to defaults with deal-specific buildable SF estimate
  const sf = acreage * 43560 * 0.3; // 30% coverage ratio
  return { ...DEFAULT_ASSUMPTIONS, buildableSf: Math.max(sf, 5000) };
}

function computeDealProForma(
  deal: DealWithRelations
): { proForma: ProFormaResults; acreage: number } {
  const acreage = getDealAcreage(deal);
  const assumptions = getDealAssumptions(deal, acreage);
  const proForma = computeProForma(assumptions);
  return { proForma, acreage };
}

async function loadDeals(orgId: string): Promise<DealWithRelations[]> {
  return prisma.deal.findMany({
    where: { orgId },
    include: {
      jurisdiction: { select: { name: true } },
      parcels: { select: { acreage: true } },
      terms: { select: { closingDate: true } },
    },
    orderBy: { updatedAt: "desc" },
  }) as unknown as DealWithRelations[];
}

async function loadTriageScores(
  orgId: string,
  dealIds: string[]
): Promise<Map<string, number | null>> {
  const triageRuns = await prisma.run.findMany({
    where: {
      orgId,
      runType: "TRIAGE",
      status: "succeeded",
      dealId: { in: dealIds },
    },
    orderBy: { startedAt: "desc" },
    distinct: ["dealId"],
    select: { dealId: true, outputJson: true },
  });

  return new Map(
    triageRuns.map((r) => {
      const output = r.outputJson as Record<string, unknown> | null;
      const score =
        output && typeof output === "object" && "confidence" in output
          ? Number(output.confidence)
          : null;
      return [r.dealId!, score];
    })
  );
}

async function loadRiskSourceScores(
  orgId: string,
  dealIds: string[]
): Promise<Map<string, number | null>> {
  const riskRows = await prisma.dealRisk.findMany({
    where: {
      orgId,
      source: "triage",
      dealId: { in: dealIds },
      score: { not: null },
    },
    select: { dealId: true, score: true },
    orderBy: { createdAt: "desc" },
  });

  const latestRiskScoreByDeal = new Map<string, number | null>();
  for (const risk of riskRows) {
    if (risk.score === null) continue;
    const score = risk.score;
    const current = latestRiskScoreByDeal.get(risk.dealId) ?? null;
    if (current === null || score < current) {
      latestRiskScoreByDeal.set(risk.dealId, score);
    }
  }

  return latestRiskScoreByDeal;
}

function getHhiBand(hhi: number): "green" | "yellow" | "red" {
  if (hhi > 0.5) return "red";
  if (hhi >= 0.25) return "yellow";
  return "green";
}

function buildExposureBuckets(
  exposures: Map<string, { exposure: number; acreage: number; count: number }>,
): { buckets: ConcentrationBucket[]; hhi: number } {
  const totalExposure = [...exposures.values()].reduce(
    (sum, value) => sum + value.exposure,
    0,
  );
  if (totalExposure <= 0) {
    return { buckets: [], hhi: 0 };
  }

  const entries = [...exposures.entries()];
  const hhi =
    Math.round(
      entries.reduce((sum, [, value]) => {
        const share = value.exposure / totalExposure;
        return sum + share * share;
      }, 0) * 1000,
    ) / 1000;

  const buckets = entries
    .map(([name, value]) => ({
      name,
      count: value.count,
      pct: Math.round((value.exposure / totalExposure) * 100),
      acreage: Math.round(value.acreage * 100) / 100,
    }))
    .sort((a, b) => b.pct - a.pct);

  return {
    buckets,
    hhi,
  };
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function quarterLabel(date: Date): string {
  const quarter = Math.floor(date.getMonth() / 3) + 1;
  return `${date.getFullYear()}-Q${quarter}`;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

const PIPELINE_SEQUENCE = [
  "INTAKE",
  "TRIAGE_DONE",
  "PREAPP",
  "CONCEPT",
  "NEIGHBORS",
  "SUBMITTED",
  "HEARING",
  "APPROVED",
  "EXIT_MARKETED",
  "EXITED",
  "KILLED",
] as const;

function nextPipelineStage(stage: string): string | null {
  const idx = PIPELINE_SEQUENCE.indexOf(stage as (typeof PIPELINE_SEQUENCE)[number]);
  if (idx < 0 || idx >= PIPELINE_SEQUENCE.length - 1) return null;
  return PIPELINE_SEQUENCE[idx + 1];
}

function percentile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * q;
  const base = Math.floor(position);
  const rest = position - base;
  const next = sorted[base + 1] ?? sorted[base];
  return sorted[base] + rest * (next - sorted[base]);
}

function summarizeDurations(
  stage: string,
  values: number[],
): StageVelocityMetric {
  if (values.length === 0) {
    return {
      stage,
      avgDays: 0,
      medianDays: 0,
      p75Days: 0,
      p90Days: 0,
      sampleSize: 0,
    };
  }
  const avgDays = values.reduce((sum, value) => sum + value, 0) / values.length;
  return {
    stage,
    avgDays: round(avgDays, 2),
    medianDays: round(percentile(values, 0.5), 2),
    p75Days: round(percentile(values, 0.75), 2),
    p90Days: round(percentile(values, 0.9), 2),
    sampleSize: values.length,
  };
}

// ---------------------------------------------------------------------------
// Service Methods
// ---------------------------------------------------------------------------

export async function getPortfolioSummary(
  orgId: string
): Promise<PortfolioSummary> {
  const deals = await loadDeals(orgId);
  const dealIds = deals.map((d) => d.id);
  const triageScores = await loadTriageScores(orgId, dealIds);

  const activeDeals = deals.filter(
    (d) => d.status !== "KILLED" && d.status !== "EXITED"
  );

  let totalEquityDeployed = 0;
  let weightedIRRSum = 0;
  let weightedCapRateSum = 0;
  let irrWeightSum = 0;
  let capRateWeightSum = 0;

  const byStatus: Record<string, number> = {};
  const bySku: Record<string, number> = {};
  const byJurisdiction: Record<string, number> = {};
  let totalAcreage = 0;

  for (const deal of deals) {
    const { proForma, acreage } = computeDealProForma(deal);
    totalAcreage += acreage;

    byStatus[deal.status] = (byStatus[deal.status] ?? 0) + 1;
    bySku[deal.sku] = (bySku[deal.sku] ?? 0) + 1;
    const jur = deal.jurisdiction?.name ?? "Unknown";
    byJurisdiction[jur] = (byJurisdiction[jur] ?? 0) + 1;

    if (deal.status !== "KILLED") {
      totalEquityDeployed += proForma.acquisitionBasis.equityRequired;

      if (proForma.leveredIRR !== null) {
        const weight = proForma.acquisitionBasis.equityRequired;
        weightedIRRSum += proForma.leveredIRR * weight;
        irrWeightSum += weight;
      }

      if (proForma.goingInCapRate > 0) {
        const weight = proForma.acquisitionBasis.purchasePrice;
        weightedCapRateSum += proForma.goingInCapRate * weight;
        capRateWeightSum += weight;
      }
    }
  }

  const scoredDeals = dealIds
    .map((id) => triageScores.get(id))
    .filter((s): s is number => s !== null);
  const avgTriageScore =
    scoredDeals.length > 0
      ? Math.round(scoredDeals.reduce((a, b) => a + b, 0) / scoredDeals.length)
      : null;

  return {
    totalDeals: deals.length,
    activeDeals: activeDeals.length,
    totalAcreage: Math.round(totalAcreage * 100) / 100,
    totalEquityDeployed: Math.round(totalEquityDeployed),
    weightedAvgIRR:
      irrWeightSum > 0
        ? Math.round((weightedIRRSum / irrWeightSum) * 10000) / 100
        : null,
    weightedAvgCapRate:
      capRateWeightSum > 0
        ? Math.round((weightedCapRateSum / capRateWeightSum) * 10000) / 100
        : null,
    avgTriageScore,
    byStatus,
    bySku,
    byJurisdiction,
  };
}

export async function getConcentrationAnalysis(
  orgId: string
): Promise<ConcentrationAnalysis> {
  const deals = await loadDeals(orgId);
  const active = deals.filter(
    (d) => d.status !== "KILLED" && d.status !== "EXITED"
  );
  const total = active.length || 1;
  const acreageByDealId = new Map<string, number>(
    active.map((deal) => [deal.id, getDealAcreage(deal)]),
  );

  // Geographic
  const geoMap = new Map<string, { count: number; acreage: number; exposure: number }>();
  for (const d of active) {
    const name = d.jurisdiction?.name ?? "Unknown";
    const entry = geoMap.get(name) ?? { count: 0, acreage: 0, exposure: 0 };
    entry.count++;
    entry.exposure++;
    entry.acreage += getDealAcreage(d);
    geoMap.set(name, entry);
  }
  const geographicExposure = new Map<string, { exposure: number; acreage: number; count: number }>();
  for (const [name, value] of geoMap.entries()) {
    geographicExposure.set(name, {
      exposure: value.exposure,
      acreage: value.acreage,
      count: value.count,
    });
  }
  const geographicData = buildExposureBuckets(geographicExposure);
  const geographic: ConcentrationBucket[] = geographicData.buckets;

  // SKU
  const skuMap = new Map<string, { count: number; acreage: number; exposure: number }>();
  for (const d of active) {
    const entry = skuMap.get(d.sku) ?? { count: 0, acreage: 0, exposure: 0 };
    entry.count++;
    entry.exposure++;
    entry.acreage += getDealAcreage(d);
    skuMap.set(d.sku, entry);
  }
  const skuExposure = new Map<string, { exposure: number; acreage: number; count: number }>();
  for (const [name, value] of skuMap.entries()) {
    skuExposure.set(name, {
      exposure: value.exposure,
      acreage: value.acreage,
      count: value.count,
    });
  }
  const skuData = buildExposureBuckets(skuExposure);
  const sku: ConcentrationBucket[] = skuData.buckets;

  // Vintage year
  const vintageMap = new Map<string, { count: number; acreage: number }>();
  for (const d of active) {
    const year = String(d.createdAt.getFullYear());
    const entry = vintageMap.get(year) ?? { count: 0, acreage: 0 };
    entry.count++;
    entry.acreage += getDealAcreage(d);
    vintageMap.set(year, entry);
  }
  const vintageYear: ConcentrationBucket[] = [...vintageMap.entries()]
    .map(([name, v]) => ({
      name,
      count: v.count,
      pct: Math.round((v.count / total) * 100),
      acreage: Math.round(v.acreage * 100) / 100,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Risk tier (based on triage scores)
  const dealIds = active.map((d) => d.id);
  const triageScores = await loadTriageScores(orgId, dealIds);
  const riskSourceScores = await loadRiskSourceScores(orgId, dealIds);
  const riskMap = new Map<string, { count: number; acreage: number }>();
  for (const d of active) {
    const score =
      triageScores.get(d.id) ?? riskSourceScores.get(d.id);
    let tier = "Unscored";
    if (score !== null && score !== undefined) {
      if (score >= 80) tier = "A (Low Risk)";
      else if (score >= 60) tier = "B (Moderate)";
      else if (score >= 40) tier = "C (Elevated)";
      else tier = "D (High Risk)";
    }
    const entry = riskMap.get(tier) ?? { count: 0, acreage: 0 };
    entry.count++;
    entry.acreage += getDealAcreage(d);
    riskMap.set(tier, entry);
  }
  const riskTier: ConcentrationBucket[] = [...riskMap.entries()]
    .map(([name, v]) => ({
      name,
      count: v.count,
      pct: Math.round((v.count / total) * 100),
      acreage: Math.round(v.acreage * 100) / 100,
    }))
    .sort((a, b) => b.count - a.count);

  const activeDealIds = active.map((deal) => deal.id);
  const financings = await prisma.dealFinancing.findMany({
    where: {
      orgId,
      dealId: { in: activeDealIds },
    },
    select: {
      dealId: true,
      lenderName: true,
      loanAmount: true,
    },
  });

  const lenderExposure = new Map<string, { exposure: number; acreage: number; count: number }>();
  for (const financing of financings) {
    const lender = financing.lenderName?.trim() || "Unspecified Lender";
    const exposureRaw = financing.loanAmount
      ? Number(financing.loanAmount.toString())
      : 1;
    const exposure = Number.isFinite(exposureRaw) && exposureRaw > 0 ? exposureRaw : 1;
    const acreage = acreageByDealId.get(financing.dealId) ?? 0;
    const entry = lenderExposure.get(lender) ?? { exposure: 0, acreage: 0, count: 0 };
    entry.exposure += exposure;
    entry.acreage += acreage;
    entry.count += 1;
    lenderExposure.set(lender, entry);
  }

  if (lenderExposure.size === 0 && active.length > 0) {
    for (const deal of active) {
      const lender = "Unspecified Lender";
      const entry = lenderExposure.get(lender) ?? { exposure: 0, acreage: 0, count: 0 };
      entry.exposure += 1;
      entry.acreage += getDealAcreage(deal);
      entry.count += 1;
      lenderExposure.set(lender, entry);
    }
  }

  const lenderData = buildExposureBuckets(lenderExposure);
  const lender: ConcentrationBucket[] = lenderData.buckets;

  const hhi = {
    parish: {
      value: geographicData.hhi,
      band: getHhiBand(geographicData.hhi),
      top3: geographic.slice(0, 3),
    },
    sku: {
      value: skuData.hhi,
      band: getHhiBand(skuData.hhi),
      top3: sku.slice(0, 3),
    },
    lender: {
      value: lenderData.hhi,
      band: getHhiBand(lenderData.hhi),
      top3: lender.slice(0, 3),
    },
    hasAlert:
      geographicData.hhi > 0.5 || skuData.hhi > 0.5 || lenderData.hhi > 0.5,
  };

  return { geographic, sku, vintageYear, riskTier, lender, hhi };
}

export async function getCapitalAllocation(
  orgId: string,
  availableEquity: number,
  maxDeals?: number
): Promise<CapitalAllocationResult> {
  const deals = await loadDeals(orgId);
  const pipeline = deals.filter(
    (d) =>
      d.status !== "KILLED" && d.status !== "EXITED" && d.status !== "EXIT_MARKETED"
  );

  const dealIds = pipeline.map((d) => d.id);
  const triageScores = await loadTriageScores(orgId, dealIds);

  const candidates: AllocationCandidate[] = pipeline.map((deal) => {
    const { proForma, acreage } = computeDealProForma(deal);
    const triageScore = triageScores.get(deal.id) ?? null;

    // Risk-adjusted score: combines triage score (0-100) with IRR
    const irrComponent = proForma.leveredIRR
      ? Math.min(proForma.leveredIRR * 100, 50) // cap at 50% for scoring
      : 10; // default low
    const triageComponent = (triageScore ?? 50) / 2; // 0-50 range
    const riskAdjustedScore = Math.round(irrComponent + triageComponent);

    return {
      dealId: deal.id,
      dealName: deal.name,
      sku: deal.sku,
      status: deal.status,
      jurisdiction: deal.jurisdiction?.name ?? "Unknown",
      acreage,
      triageScore,
      equityRequired: proForma.acquisitionBasis.equityRequired,
      projectedIRR: proForma.leveredIRR
        ? Math.round(proForma.leveredIRR * 10000) / 100
        : null,
      riskAdjustedScore,
      recommended: false,
      allocationAmount: 0,
    };
  });

  // Sort by risk-adjusted score descending
  candidates.sort((a, b) => b.riskAdjustedScore - a.riskAdjustedScore);

  // Allocate
  let remaining = availableEquity;
  let dealsAllocated = 0;
  const limit = maxDeals ?? candidates.length;

  for (const c of candidates) {
    if (dealsAllocated >= limit || remaining <= 0) break;
    if (c.equityRequired <= remaining) {
      c.recommended = true;
      c.allocationAmount = c.equityRequired;
      remaining -= c.equityRequired;
      dealsAllocated++;
    }
  }

  return {
    availableEquity,
    allocatedEquity: availableEquity - remaining,
    unallocatedEquity: remaining,
    candidates,
  };
}

export async function get1031Matches(
  orgId: string,
  dispositionDealId: string
): Promise<Match1031Result> {
  const deals = await loadDeals(orgId);
  const dispositionDeal = deals.find((d) => d.id === dispositionDealId);

  if (!dispositionDeal) {
    throw new Error("Disposition deal not found");
  }

  const { proForma: dispProForma } = computeDealProForma(dispositionDeal);
  const estimatedSalePrice = dispProForma.exitAnalysis.salePrice;

  const deadlines = calculate1031Deadlines({
    saleCloseDate: dispositionDeal.terms?.closingDate ?? new Date(),
  });

  // Find acquisition candidates: active deals not yet closed, similar or greater value
  const candidates = deals.filter(
    (d) =>
      d.id !== dispositionDealId &&
      d.status !== "KILLED" &&
      d.status !== "EXITED"
  );

  const matches: Match1031[] = candidates
    .map((deal) => {
      const { proForma, acreage } = computeDealProForma(deal);
      const estValue = proForma.acquisitionBasis.purchasePrice;
      const matchReasons: string[] = [];
      let matchScore = 0;

      // Value match (within 50-200% of sale price)
      const valueRatio = estValue / (estimatedSalePrice || 1);
      if (valueRatio >= 1.0) {
        matchScore += 40;
        matchReasons.push("Equal or greater value (full deferral)");
      } else if (valueRatio >= 0.75) {
        matchScore += 25;
        matchReasons.push("Partial value match (partial deferral)");
      } else if (valueRatio >= 0.5) {
        matchScore += 10;
        matchReasons.push("Below value threshold");
      }

      // Same property type
      if (deal.sku === dispositionDeal.sku) {
        matchScore += 20;
        matchReasons.push("Same property type (like-kind)");
      } else {
        matchScore += 15;
        matchReasons.push("Different property type (still qualifies)");
      }

      // Pipeline stage (earlier = more time)
      const earlyStages = ["INTAKE", "TRIAGE_DONE", "PREAPP", "CONCEPT"];
      if (earlyStages.includes(deal.status)) {
        matchScore += 20;
        matchReasons.push("Early pipeline stage — time to close");
      } else {
        matchScore += 10;
        matchReasons.push("Advanced pipeline stage");
      }

      // Geography diversification bonus
      if (
        deal.jurisdiction?.name !== dispositionDeal.jurisdiction?.name
      ) {
        matchScore += 10;
        matchReasons.push("Geographic diversification");
      }

      return {
        dealId: deal.id,
        dealName: deal.name,
        sku: deal.sku,
        status: deal.status,
        jurisdiction: deal.jurisdiction?.name ?? "Unknown",
        acreage,
        estimatedValue: Math.round(estValue),
        identificationDeadline: deadlines.identificationDeadline,
        closeDeadline: deadlines.closingDeadline,
        matchScore,
        matchReasons,
      };
    })
    .filter((m) => m.matchScore >= 25)
    .sort((a, b) => b.matchScore - a.matchScore);

  return {
    dispositionDealId,
    dispositionDealName: dispositionDeal.name,
    estimatedSalePrice: Math.round(estimatedSalePrice),
    identificationDeadline: deadlines.identificationDeadline,
    closeDeadline: deadlines.closingDeadline,
    candidates: matches,
  };
}

export async function getPortfolioStressTest(
  orgId: string,
  scenario: StressScenario
): Promise<PortfolioStressTestResult> {
  const deals = await loadDeals(orgId);
  const active = deals.filter(
    (d) => d.status !== "KILLED" && d.status !== "EXITED"
  );

  const results: StressResult[] = [];
  let baseIRRSum = 0;
  let stressedIRRSum = 0;
  let irrCount = 0;
  let dealsAtRisk = 0;

  for (const deal of active) {
    const acreage = getDealAcreage(deal);
    const baseAssumptions = getDealAssumptions(deal, acreage);
    const baseProForma = computeProForma(baseAssumptions);

    // Apply stress scenario
    const stressedAssumptions: FinancialModelAssumptions = JSON.parse(
      JSON.stringify(baseAssumptions)
    );

    if (scenario.rateShockBps) {
      stressedAssumptions.financing.interestRate +=
        scenario.rateShockBps / 100;
    }
    if (scenario.vacancySpikePct) {
      stressedAssumptions.income.vacancyPct += scenario.vacancySpikePct;
    }
    if (scenario.rentDeclinePct) {
      stressedAssumptions.income.rentPerSf *=
        1 - scenario.rentDeclinePct / 100;
    }
    if (scenario.capRateExpansionBps) {
      stressedAssumptions.exit.exitCapRate +=
        scenario.capRateExpansionBps / 100;
    }

    const stressedProForma = computeProForma(stressedAssumptions);

    const baseIRR = baseProForma.leveredIRR;
    const stressedIRR = stressedProForma.leveredIRR;
    const atRisk =
      stressedProForma.dscr < 1.0 ||
      (stressedIRR !== null && stressedIRR < 0) ||
      stressedProForma.equityMultiple < 1.0;

    if (atRisk) dealsAtRisk++;

    if (baseIRR !== null && stressedIRR !== null) {
      baseIRRSum += baseIRR;
      stressedIRRSum += stressedIRR;
      irrCount++;
    }

    results.push({
      dealId: deal.id,
      dealName: deal.name,
      baseIRR: baseIRR !== null ? Math.round(baseIRR * 10000) / 100 : null,
      stressedIRR:
        stressedIRR !== null
          ? Math.round(stressedIRR * 10000) / 100
          : null,
      baseDSCR: baseProForma.dscr,
      stressedDSCR: stressedProForma.dscr,
      baseEquityMultiple: baseProForma.equityMultiple,
      stressedEquityMultiple: stressedProForma.equityMultiple,
      irrChange:
        baseIRR !== null && stressedIRR !== null
          ? Math.round((stressedIRR - baseIRR) * 10000) / 100
          : null,
      dscrChange:
        Math.round((stressedProForma.dscr - baseProForma.dscr) * 100) / 100,
      atRisk,
    });
  }

  return {
    scenario,
    results: results.sort((a, b) => (a.atRisk ? -1 : 1) - (b.atRisk ? -1 : 1)),
    portfolioBaseIRR:
      irrCount > 0
        ? Math.round((baseIRRSum / irrCount) * 10000) / 100
        : null,
    portfolioStressedIRR:
      irrCount > 0
        ? Math.round((stressedIRRSum / irrCount) * 10000) / 100
        : null,
    dealsAtRisk,
    totalDeals: active.length,
  };
}

export async function getDebtMaturityWall(
  orgId: string,
): Promise<DebtMaturityWall> {
  const now = new Date();
  const next12Months = addMonths(now, 12);

  const financings = await prisma.dealFinancing.findMany({
    where: {
      orgId,
      deal: {
        status: { notIn: ["KILLED", "EXITED"] },
      },
    },
    select: {
      dealId: true,
      loanAmount: true,
      commitmentDate: true,
      fundedDate: true,
      loanTermMonths: true,
      dscrRequirement: true,
      deal: {
        select: {
          id: true,
          terms: {
            select: {
              closingDate: true,
            },
          },
        },
      },
    },
  });

  type QuarterAccumulator = {
    totalDebtMaturing: number;
    deals: Set<string>;
    weightedDscrNumerator: number;
    weightedDebt: number;
    quarterStart: Date;
  };

  const byQuarter = new Map<string, QuarterAccumulator>();
  let totalPortfolioDebt = 0;
  let debtMaturing12Months = 0;

  for (const financing of financings) {
    const loanAmount = financing.loanAmount
      ? Number(financing.loanAmount.toString())
      : null;
    if (loanAmount === null || !Number.isFinite(loanAmount) || loanAmount <= 0) {
      continue;
    }

    const startDate =
      financing.fundedDate ??
      financing.commitmentDate ??
      financing.deal.terms?.closingDate ??
      null;
    if (!startDate) continue;

    const maturityDate =
      financing.loanTermMonths && financing.loanTermMonths > 0
        ? addMonths(startDate, financing.loanTermMonths)
        : startDate;

    const quarter = quarterLabel(maturityDate);
    const quarterStart = new Date(
      maturityDate.getFullYear(),
      Math.floor(maturityDate.getMonth() / 3) * 3,
      1,
    );

    const entry = byQuarter.get(quarter) ?? {
      totalDebtMaturing: 0,
      deals: new Set<string>(),
      weightedDscrNumerator: 0,
      weightedDebt: 0,
      quarterStart,
    };
    entry.totalDebtMaturing += loanAmount;
    entry.deals.add(financing.dealId);

    const dscrRequirement = financing.dscrRequirement
      ? Number(financing.dscrRequirement.toString())
      : null;
    if (dscrRequirement !== null && Number.isFinite(dscrRequirement)) {
      entry.weightedDscrNumerator += dscrRequirement * loanAmount;
      entry.weightedDebt += loanAmount;
    }

    byQuarter.set(quarter, entry);

    totalPortfolioDebt += loanAmount;
    if (maturityDate <= next12Months) {
      debtMaturing12Months += loanAmount;
    }
  }

  const sortedEntries = [...byQuarter.entries()].sort(
    (a, b) => a[1].quarterStart.getTime() - b[1].quarterStart.getTime(),
  );

  const quarters: DebtMaturityQuarter[] = sortedEntries.map(([quarter, value]) => {
    const debtShare =
      totalPortfolioDebt > 0 ? value.totalDebtMaturing / totalPortfolioDebt : 0;
    const avgDscrReq =
      value.weightedDebt > 0 ? value.weightedDscrNumerator / value.weightedDebt : null;

    let score = Math.round(debtShare * 100 * 0.8 + value.deals.size * 4);
    if (avgDscrReq !== null && avgDscrReq >= 1.35) {
      score += 8;
    }
    const refinanceRiskScore = Math.max(0, Math.min(100, score));

    return {
      quarter,
      totalDebtMaturing: Math.round(value.totalDebtMaturing),
      dealsAffected: value.deals.size,
      refinanceRiskScore,
    };
  });

  const debtMaturing12MonthsPct =
    totalPortfolioDebt > 0 ? debtMaturing12Months / totalPortfolioDebt : 0;
  const alert = debtMaturing12MonthsPct > 0.2;

  return {
    totalPortfolioDebt: Math.round(totalPortfolioDebt),
    debtMaturing12Months: Math.round(debtMaturing12Months),
    debtMaturing12MonthsPct:
      Math.round(debtMaturing12MonthsPct * 10000) / 100,
    alert,
    quarters,
  };
}

export async function getDealVelocityAnalytics(
  orgId: string,
): Promise<DealVelocityAnalytics> {
  const now = new Date();
  const deals = await prisma.deal.findMany({
    where: { orgId },
    select: {
      id: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (deals.length === 0) {
    return {
      stageDurations: PIPELINE_SEQUENCE.map((stage) => summarizeDurations(stage, [])),
      killRateByStage: PIPELINE_SEQUENCE.filter((stage) => stage !== "EXITED" && stage !== "KILLED").map((stage) => ({
        stage,
        totalEntered: 0,
        killedCount: 0,
        killRatePct: 0,
      })),
      funnelLeakage: PIPELINE_SEQUENCE.filter((stage) => stage !== "EXITED" && stage !== "KILLED").map((stage) => ({
        stage,
        nextStage: nextPipelineStage(stage),
        enteredCount: 0,
        advancedCount: 0,
        droppedCount: 0,
        dropOffPct: 0,
      })),
      quarterOverQuarter: [],
    };
  }

  const dealIds = deals.map((deal) => deal.id);
  const transitions = await prisma.automationEvent.findMany({
    where: {
      eventType: "deal.statusChanged",
      dealId: { in: dealIds },
    },
    select: {
      dealId: true,
      startedAt: true,
      inputData: true,
    },
    orderBy: { startedAt: "asc" },
  });

  const transitionsByDeal = new Map<
    string,
    Array<{ at: Date; from: string | null; to: string | null }>
  >();
  for (const event of transitions) {
    if (!event.dealId) continue;
    const payload =
      typeof event.inputData === "object" && event.inputData !== null
        ? (event.inputData as Record<string, unknown>)
        : null;
    const from =
      payload && typeof payload.from === "string" ? payload.from : null;
    const to = payload && typeof payload.to === "string" ? payload.to : null;

    const rows = transitionsByDeal.get(event.dealId) ?? [];
    rows.push({ at: event.startedAt, from, to });
    transitionsByDeal.set(event.dealId, rows);
  }

  const enteredCounts = new Map<string, number>();
  const advancedCounts = new Map<string, number>();
  const killedAtStage = new Map<string, number>();
  const durationsByStage = new Map<string, number[]>();
  const durationsByQuarter = new Map<string, number[]>();

  for (const deal of deals) {
    const rows = transitionsByDeal.get(deal.id) ?? [];
    let currentStage = "INTAKE";
    let stageStart = deal.createdAt;

    enteredCounts.set("INTAKE", (enteredCounts.get("INTAKE") ?? 0) + 1);

    for (const row of rows) {
      const fromStage = row.from ?? currentStage;
      const toStage = row.to ?? deal.status;
      const durationDays = Math.max(
        0,
        (row.at.getTime() - stageStart.getTime()) / (1000 * 60 * 60 * 24),
      );

      const stageSamples = durationsByStage.get(fromStage) ?? [];
      stageSamples.push(durationDays);
      durationsByStage.set(fromStage, stageSamples);

      const quarter = quarterLabel(row.at);
      const quarterSamples = durationsByQuarter.get(quarter) ?? [];
      quarterSamples.push(durationDays);
      durationsByQuarter.set(quarter, quarterSamples);

      enteredCounts.set(toStage, (enteredCounts.get(toStage) ?? 0) + 1);
      if (toStage === "KILLED") {
        killedAtStage.set(fromStage, (killedAtStage.get(fromStage) ?? 0) + 1);
      }
      if (nextPipelineStage(fromStage) === toStage) {
        advancedCounts.set(fromStage, (advancedCounts.get(fromStage) ?? 0) + 1);
      }

      currentStage = toStage;
      stageStart = row.at;
    }

    const openDurationDays = Math.max(
      0,
      (now.getTime() - stageStart.getTime()) / (1000 * 60 * 60 * 24),
    );
    const liveStage = deal.status || currentStage;
    const stageSamples = durationsByStage.get(liveStage) ?? [];
    stageSamples.push(openDurationDays);
    durationsByStage.set(liveStage, stageSamples);

    const currentQuarter = quarterLabel(now);
    const quarterSamples = durationsByQuarter.get(currentQuarter) ?? [];
    quarterSamples.push(openDurationDays);
    durationsByQuarter.set(currentQuarter, quarterSamples);
  }

  const stageDurations = PIPELINE_SEQUENCE.map((stage) =>
    summarizeDurations(stage, durationsByStage.get(stage) ?? []),
  );

  const nonTerminalStages = PIPELINE_SEQUENCE.filter(
    (stage) => stage !== "EXITED" && stage !== "KILLED",
  );

  const killRateByStage = nonTerminalStages.map((stage) => {
    const totalEntered = enteredCounts.get(stage) ?? 0;
    const killedCount = killedAtStage.get(stage) ?? 0;
    const killRatePct =
      totalEntered > 0 ? round((killedCount / totalEntered) * 100, 2) : 0;
    return {
      stage,
      totalEntered,
      killedCount,
      killRatePct,
    };
  });

  const funnelLeakage = nonTerminalStages.map((stage) => {
    const enteredCount = enteredCounts.get(stage) ?? 0;
    const advancedCount = advancedCounts.get(stage) ?? 0;
    const droppedCount = Math.max(enteredCount - advancedCount, 0);
    const dropOffPct =
      enteredCount > 0 ? round((droppedCount / enteredCount) * 100, 2) : 0;
    return {
      stage,
      nextStage: nextPipelineStage(stage),
      enteredCount,
      advancedCount,
      droppedCount,
      dropOffPct,
    };
  });

  const quarterKeys = [...durationsByQuarter.keys()].sort();
  const quarterOverQuarter: VelocityQuarterTrend[] = quarterKeys.map(
    (quarter, idx) => {
      const values = durationsByQuarter.get(quarter) ?? [];
      const base = summarizeDurations(quarter, values);
      const prev = idx > 0 ? durationsByQuarter.get(quarterKeys[idx - 1]) ?? [] : [];
      const prevAvg =
        prev.length > 0 ? prev.reduce((sum, value) => sum + value, 0) / prev.length : null;
      const trend: "faster" | "slower" | "flat" =
        prevAvg === null
          ? "flat"
          : base.avgDays < prevAvg - 0.5
            ? "faster"
            : base.avgDays > prevAvg + 0.5
              ? "slower"
              : "flat";
      return {
        quarter,
        avgDays: base.avgDays,
        medianDays: base.medianDays,
        p75Days: base.p75Days,
        p90Days: base.p90Days,
        sampleSize: base.sampleSize,
        trend,
      };
    },
  );

  return {
    stageDurations,
    killRateByStage,
    funnelLeakage,
    quarterOverQuarter,
  };
}

export async function getCapitalDeploymentAnalytics(
  orgId: string,
): Promise<CapitalDeploymentAnalytics> {
  const deals = await prisma.deal.findMany({
    where: { orgId },
    select: {
      id: true,
      status: true,
      parcels: { select: { id: true, acreage: true } },
    },
  });

  let records: Array<{
    stage: string;
    capitalCommitted: { toString(): string };
    capitalDeployed: { toString(): string };
    nonRecoverableExpense: { toString(): string };
    dealId: string;
  }> = [];

  try {
    records = await prisma.capitalDeployment.findMany({
      where: { orgId },
      select: {
        stage: true,
        capitalCommitted: true,
        capitalDeployed: true,
        nonRecoverableExpense: true,
        dealId: true,
      },
    });
  } catch (error) {
    const prismaCode =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof (error as { code?: unknown }).code === "string"
        ? (error as { code: string }).code
        : null;
    const message = error instanceof Error ? error.message : String(error);
    const missingCapitalDeploymentsTable =
      prismaCode === "P2021" &&
      message.toLowerCase().includes("capital_deployments");

    if (!missingCapitalDeploymentsTable) {
      throw error;
    }

    console.warn(
      "[portfolio-analytics] capital_deployments table missing; returning zeroed capital deployment metrics",
      { orgId, prismaCode },
    );
  }

  const activeDeals = deals.filter(
    (deal) => deal.status !== "KILLED" && deal.status !== "EXITED",
  );
  const activeParcelCount = activeDeals.reduce(
    (sum, deal) => sum + deal.parcels.length,
    0,
  );
  const activeAcreage = activeDeals.reduce((sum, deal) => {
    const acreage = deal.parcels.reduce(
      (parcelSum, parcel) =>
        parcelSum + (parcel.acreage ? Number(parcel.acreage.toString()) : 0),
      0,
    );
    return sum + acreage;
  }, 0);

  const stageMap = new Map<
    string,
    { committed: number; deployed: number; nonRecoverable: number; entries: number }
  >();
  let totalCommitted = 0;
  let totalDeployed = 0;
  let totalNonRecoverable = 0;
  let sunkCostKilledDeals = 0;
  const statusByDealId = new Map(deals.map((deal) => [deal.id, deal.status]));

  for (const record of records) {
    const committed = Number(record.capitalCommitted.toString());
    const deployed = Number(record.capitalDeployed.toString());
    const nonRecoverable = Number(record.nonRecoverableExpense.toString());
    totalCommitted += committed;
    totalDeployed += deployed;
    totalNonRecoverable += nonRecoverable;

    if (statusByDealId.get(record.dealId) === "KILLED") {
      sunkCostKilledDeals += nonRecoverable;
    }

    const row = stageMap.get(record.stage) ?? {
      committed: 0,
      deployed: 0,
      nonRecoverable: 0,
      entries: 0,
    };
    row.committed += committed;
    row.deployed += deployed;
    row.nonRecoverable += nonRecoverable;
    row.entries += 1;
    stageMap.set(record.stage, row);
  }

  const stageRollup = [...stageMap.entries()]
    .map(([stage, row]) => ({
      stage,
      committed: Math.round(row.committed),
      deployed: Math.round(row.deployed),
      nonRecoverable: Math.round(row.nonRecoverable),
      efficiencyPct:
        row.committed > 0 ? round((row.deployed / row.committed) * 100, 2) : 0,
      entries: row.entries,
    }))
    .sort((a, b) => b.committed - a.committed);

  return {
    totalCommitted: Math.round(totalCommitted),
    totalDeployed: Math.round(totalDeployed),
    totalNonRecoverable: Math.round(totalNonRecoverable),
    costPerActiveParcel:
      activeParcelCount > 0 ? round(totalDeployed / activeParcelCount, 2) : 0,
    costPerAcre: activeAcreage > 0 ? round(totalDeployed / activeAcreage, 2) : 0,
    sunkCostKilledDeals: Math.round(sunkCostKilledDeals),
    stageRollup,
  };
}
