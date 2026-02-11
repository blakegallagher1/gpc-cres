import { prisma } from "@entitlement-os/db";
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

  // Geographic
  const geoMap = new Map<string, { count: number; acreage: number }>();
  for (const d of active) {
    const name = d.jurisdiction?.name ?? "Unknown";
    const entry = geoMap.get(name) ?? { count: 0, acreage: 0 };
    entry.count++;
    entry.acreage += getDealAcreage(d);
    geoMap.set(name, entry);
  }
  const geographic: ConcentrationBucket[] = [...geoMap.entries()]
    .map(([name, v]) => ({
      name,
      count: v.count,
      pct: Math.round((v.count / total) * 100),
      acreage: Math.round(v.acreage * 100) / 100,
    }))
    .sort((a, b) => b.count - a.count);

  // SKU
  const skuMap = new Map<string, { count: number; acreage: number }>();
  for (const d of active) {
    const entry = skuMap.get(d.sku) ?? { count: 0, acreage: 0 };
    entry.count++;
    entry.acreage += getDealAcreage(d);
    skuMap.set(d.sku, entry);
  }
  const sku: ConcentrationBucket[] = [...skuMap.entries()]
    .map(([name, v]) => ({
      name,
      count: v.count,
      pct: Math.round((v.count / total) * 100),
      acreage: Math.round(v.acreage * 100) / 100,
    }))
    .sort((a, b) => b.count - a.count);

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
  const riskMap = new Map<string, { count: number; acreage: number }>();
  for (const d of active) {
    const score = triageScores.get(d.id);
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

  return { geographic, sku, vintageYear, riskTier };
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

  // 1031 deadlines from today
  const now = new Date();
  const idDeadline = new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000);
  const closeDeadline = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000);

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
        identificationDeadline: idDeadline.toISOString().split("T")[0],
        closeDeadline: closeDeadline.toISOString().split("T")[0],
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
    identificationDeadline: idDeadline.toISOString().split("T")[0],
    closeDeadline: closeDeadline.toISOString().split("T")[0],
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
