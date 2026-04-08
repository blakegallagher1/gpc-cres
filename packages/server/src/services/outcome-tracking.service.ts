import { prisma } from "@entitlement-os/db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DealOutcomeRecord {
  id: string;
  dealId: string;
  dealName: string;
  actualPurchasePrice: number | null;
  actualNoiYear1: number | null;
  actualExitPrice: number | null;
  actualIrr: number | null;
  actualEquityMultiple: number | null;
  actualHoldPeriodMonths: number | null;
  exitDate: string | null;
  exitType: string | null;
  killReason: string | null;
  killWasCorrect: boolean | null;
  notes: string | null;
  createdAt: string;
}

type DealOutcomePayload = {
  actualPurchasePrice?: number | null;
  actualNoiYear1?: number | null;
  actualExitPrice?: number | null;
  actualIrr?: number | null;
  actualEquityMultiple?: number | null;
  actualHoldPeriodMonths?: number | null;
  exitDate?: string | null;
  exitType?: string | null;
  killReason?: string | null;
  killWasCorrect?: boolean | null;
  notes?: string | null;
};

export interface AssumptionBias {
  assumptionName: string;
  avgProjected: number;
  avgActual: number;
  avgVariancePct: number;
  sampleSize: number;
  direction: "over" | "under" | "neutral";
}

export interface TriageCalibration {
  triageTier: string;
  totalDeals: number;
  exitedDeals: number;
  killedDeals: number;
  avgActualIrr: number | null;
  avgActualEquityMultiple: number | null;
  successRate: number;
}

export interface PredictionTrackingSummary {
  avgIrrOverestimatePct: number | null;
  avgTimelineUnderestimateMonths: number | null;
  riskAccuracyScore: number | null;
  sampleSize: number;
}

export interface OutcomeSummary {
  totalExited: number;
  totalKilled: number;
  avgIrr: number | null;
  avgEquityMultiple: number | null;
  avgHoldMonths: number | null;
  topBiases: AssumptionBias[];
  triageCalibration: TriageCalibration[];
  predictionTracking: PredictionTrackingSummary;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export async function upsertDealOutcome(
  dealId: string,
  createdBy: string,
  data: {
    actualPurchasePrice?: number | null;
    actualNoiYear1?: number | null;
    actualExitPrice?: number | null;
    actualIrr?: number | null;
    actualEquityMultiple?: number | null;
    actualHoldPeriodMonths?: number | null;
    exitDate?: string | null;
    exitType?: string | null;
    killReason?: string | null;
    killWasCorrect?: boolean | null;
    notes?: string | null;
  }
): Promise<string> {
  const record = await prisma.dealOutcome.upsert({
    where: { dealId },
    create: {
      dealId,
      createdBy,
      actualPurchasePrice: data.actualPurchasePrice ?? null,
      actualNoiYear1: data.actualNoiYear1 ?? null,
      actualExitPrice: data.actualExitPrice ?? null,
      actualIrr: data.actualIrr ?? null,
      actualEquityMultiple: data.actualEquityMultiple ?? null,
      actualHoldPeriodMonths: data.actualHoldPeriodMonths ?? null,
      exitDate: data.exitDate ? new Date(data.exitDate) : null,
      exitType: data.exitType ?? null,
      killReason: data.killReason ?? null,
      killWasCorrect: data.killWasCorrect ?? null,
      notes: data.notes ?? null,
    },
    update: {
      actualPurchasePrice: data.actualPurchasePrice ?? undefined,
      actualNoiYear1: data.actualNoiYear1 ?? undefined,
      actualExitPrice: data.actualExitPrice ?? undefined,
      actualIrr: data.actualIrr ?? undefined,
      actualEquityMultiple: data.actualEquityMultiple ?? undefined,
      actualHoldPeriodMonths: data.actualHoldPeriodMonths ?? undefined,
      exitDate: data.exitDate ? new Date(data.exitDate) : undefined,
      exitType: data.exitType ?? undefined,
      killReason: data.killReason ?? undefined,
      killWasCorrect: data.killWasCorrect ?? undefined,
      notes: data.notes ?? undefined,
    },
  });
  return record.id;
}

export async function upsertDealOutcomeForOrg(
  orgId: string,
  dealId: string,
  createdBy: string,
  data: DealOutcomePayload
): Promise<DealOutcomeRecord> {
  const deal = await prisma.deal.findFirst({
    where: { id: dealId, orgId },
    select: { id: true },
  });
  if (!deal) {
    throw new Error("Deal not found");
  }

  const record = await prisma.dealOutcome.upsert({
    where: { dealId },
    create: {
      dealId,
      createdBy,
      actualPurchasePrice: data.actualPurchasePrice ?? null,
      actualNoiYear1: data.actualNoiYear1 ?? null,
      actualExitPrice: data.actualExitPrice ?? null,
      actualIrr: data.actualIrr ?? null,
      actualEquityMultiple: data.actualEquityMultiple ?? null,
      actualHoldPeriodMonths: data.actualHoldPeriodMonths ?? null,
      exitDate: data.exitDate ? new Date(data.exitDate) : null,
      exitType: data.exitType ?? null,
      killReason: data.killReason ?? null,
      killWasCorrect: data.killWasCorrect ?? null,
      notes: data.notes ?? null,
    },
    update: {
      actualPurchasePrice: data.actualPurchasePrice,
      actualNoiYear1: data.actualNoiYear1,
      actualExitPrice: data.actualExitPrice,
      actualIrr: data.actualIrr,
      actualEquityMultiple: data.actualEquityMultiple,
      actualHoldPeriodMonths: data.actualHoldPeriodMonths,
      exitDate: data.exitDate ? new Date(data.exitDate) : data.exitDate,
      exitType: data.exitType,
      killReason: data.killReason,
      killWasCorrect: data.killWasCorrect,
      notes: data.notes,
    },
    include: { deal: { select: { name: true } } },
  });

  return {
    id: record.id,
    dealId: record.dealId,
    dealName: (record as unknown as { deal: { name: string } }).deal.name,
    actualPurchasePrice: record.actualPurchasePrice
      ? Number(record.actualPurchasePrice)
      : null,
    actualNoiYear1: record.actualNoiYear1
      ? Number(record.actualNoiYear1)
      : null,
    actualExitPrice: record.actualExitPrice
      ? Number(record.actualExitPrice)
      : null,
    actualIrr: record.actualIrr ? Number(record.actualIrr) : null,
    actualEquityMultiple: record.actualEquityMultiple
      ? Number(record.actualEquityMultiple)
      : null,
    actualHoldPeriodMonths: record.actualHoldPeriodMonths,
    exitDate: record.exitDate ? record.exitDate.toISOString().slice(0, 10) : null,
    exitType: record.exitType,
    killReason: record.killReason,
    killWasCorrect: record.killWasCorrect,
    notes: record.notes,
    createdAt: record.createdAt.toISOString(),
  };
}

export async function recordAssumptionActuals(
  dealId: string,
  actuals: Array<{
    assumptionName: string;
    projectedValue: number;
    actualValue: number | null;
  }>
): Promise<number> {
  let count = 0;
  for (const a of actuals) {
    const variancePct =
      a.actualValue != null && a.projectedValue !== 0
        ? ((a.actualValue - a.projectedValue) / Math.abs(a.projectedValue)) * 100
        : null;

    await prisma.assumptionActual.create({
      data: {
        dealId,
        assumptionName: a.assumptionName,
        projectedValue: a.projectedValue,
        actualValue: a.actualValue,
        variancePct,
      },
    });
    count++;
  }
  return count;
}

export async function getDealOutcome(
  dealId: string
): Promise<DealOutcomeRecord | null> {
  const record = await prisma.dealOutcome.findUnique({
    where: { dealId },
    include: { deal: { select: { name: true } } },
  });

  if (!record) return null;

  return {
    id: record.id,
    dealId: record.dealId,
    dealName: (record as unknown as { deal: { name: string } }).deal.name,
    actualPurchasePrice: record.actualPurchasePrice
      ? Number(record.actualPurchasePrice)
      : null,
    actualNoiYear1: record.actualNoiYear1
      ? Number(record.actualNoiYear1)
      : null,
    actualExitPrice: record.actualExitPrice
      ? Number(record.actualExitPrice)
      : null,
    actualIrr: record.actualIrr ? Number(record.actualIrr) : null,
    actualEquityMultiple: record.actualEquityMultiple
      ? Number(record.actualEquityMultiple)
      : null,
    actualHoldPeriodMonths: record.actualHoldPeriodMonths,
    exitDate: record.exitDate
      ? record.exitDate.toISOString().slice(0, 10)
      : null,
    exitType: record.exitType,
    killReason: record.killReason,
    killWasCorrect: record.killWasCorrect,
    notes: record.notes,
    createdAt: record.createdAt.toISOString(),
  };
}

export async function getDealOutcomeForOrg(
  orgId: string,
  dealId: string
): Promise<DealOutcomeRecord | null> {
  const record = await prisma.dealOutcome.findFirst({
    where: { dealId, deal: { orgId } },
    include: { deal: { select: { name: true } } },
  });

  if (!record) return null;

  return {
    id: record.id,
    dealId: record.dealId,
    dealName: (record as unknown as { deal: { name: string } }).deal.name,
    actualPurchasePrice: record.actualPurchasePrice
      ? Number(record.actualPurchasePrice)
      : null,
    actualNoiYear1: record.actualNoiYear1
      ? Number(record.actualNoiYear1)
      : null,
    actualExitPrice: record.actualExitPrice
      ? Number(record.actualExitPrice)
      : null,
    actualIrr: record.actualIrr ? Number(record.actualIrr) : null,
    actualEquityMultiple: record.actualEquityMultiple
      ? Number(record.actualEquityMultiple)
      : null,
    actualHoldPeriodMonths: record.actualHoldPeriodMonths,
    exitDate: record.exitDate ? record.exitDate.toISOString().slice(0, 10) : null,
    exitType: record.exitType,
    killReason: record.killReason,
    killWasCorrect: record.killWasCorrect,
    notes: record.notes,
    createdAt: record.createdAt.toISOString(),
  };
}

export async function updateDealOutcomeForOrg(
  orgId: string,
  dealId: string,
  data: DealOutcomePayload
): Promise<DealOutcomeRecord> {
  const existing = await prisma.dealOutcome.findFirst({
    where: { dealId, deal: { orgId } },
    select: { id: true },
  });
  if (!existing) {
    throw new Error("Outcome not found");
  }

  const record = await prisma.dealOutcome.update({
    where: { dealId },
    data: {
      actualPurchasePrice: data.actualPurchasePrice,
      actualNoiYear1: data.actualNoiYear1,
      actualExitPrice: data.actualExitPrice,
      actualIrr: data.actualIrr,
      actualEquityMultiple: data.actualEquityMultiple,
      actualHoldPeriodMonths: data.actualHoldPeriodMonths,
      exitDate: data.exitDate ? new Date(data.exitDate) : data.exitDate,
      exitType: data.exitType,
      killReason: data.killReason,
      killWasCorrect: data.killWasCorrect,
      notes: data.notes,
    },
    include: { deal: { select: { name: true } } },
  });

  return {
    id: record.id,
    dealId: record.dealId,
    dealName: (record as unknown as { deal: { name: string } }).deal.name,
    actualPurchasePrice: record.actualPurchasePrice
      ? Number(record.actualPurchasePrice)
      : null,
    actualNoiYear1: record.actualNoiYear1
      ? Number(record.actualNoiYear1)
      : null,
    actualExitPrice: record.actualExitPrice
      ? Number(record.actualExitPrice)
      : null,
    actualIrr: record.actualIrr ? Number(record.actualIrr) : null,
    actualEquityMultiple: record.actualEquityMultiple
      ? Number(record.actualEquityMultiple)
      : null,
    actualHoldPeriodMonths: record.actualHoldPeriodMonths,
    exitDate: record.exitDate ? record.exitDate.toISOString().slice(0, 10) : null,
    exitType: record.exitType,
    killReason: record.killReason,
    killWasCorrect: record.killWasCorrect,
    notes: record.notes,
    createdAt: record.createdAt.toISOString(),
  };
}

export async function getOutcomeSummary(orgId: string): Promise<OutcomeSummary> {
  // Get all outcomes for the org
  const outcomes = await prisma.dealOutcome.findMany({
    where: { deal: { orgId } },
    include: { deal: { select: { status: true } } },
  });

  const exited = outcomes.filter(
    (o) => (o as unknown as { deal: { status: string } }).deal.status === "EXITED"
  );
  const killed = outcomes.filter(
    (o) => (o as unknown as { deal: { status: string } }).deal.status === "KILLED"
  );

  // Average metrics from exited deals
  const irrValues = exited
    .map((o) => (o.actualIrr ? Number(o.actualIrr) : null))
    .filter((v): v is number => v !== null);
  const emValues = exited
    .map((o) => (o.actualEquityMultiple ? Number(o.actualEquityMultiple) : null))
    .filter((v): v is number => v !== null);
  const holdValues = exited
    .map((o) => o.actualHoldPeriodMonths)
    .filter((v): v is number => v !== null);

  const avg = (arr: number[]) =>
    arr.length > 0
      ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 100) / 100
      : null;

  // Assumption biases
  const biases = await getAssumptionBiases(orgId);

  // Triage calibration
  const calibration = await getTriageCalibration(orgId);
  const predictionTracking = await getPredictionTrackingSummary(orgId);

  return {
    totalExited: exited.length,
    totalKilled: killed.length,
    avgIrr: avg(irrValues),
    avgEquityMultiple: avg(emValues),
    avgHoldMonths: holdValues.length > 0
      ? Math.round(holdValues.reduce((a, b) => a + b, 0) / holdValues.length)
      : null,
    topBiases: biases,
    triageCalibration: calibration,
    predictionTracking,
  };
}

async function getAssumptionBiases(orgId: string): Promise<AssumptionBias[]> {
  const actuals = await prisma.assumptionActual.findMany({
    where: {
      deal: { orgId },
      actualValue: { not: null },
      variancePct: { not: null },
    },
  });

  // Group by assumption name
  const byName = new Map<
    string,
    { projected: number[]; actual: number[]; variances: number[] }
  >();

  for (const a of actuals) {
    const entry = byName.get(a.assumptionName) ?? {
      projected: [],
      actual: [],
      variances: [],
    };
    entry.projected.push(Number(a.projectedValue));
    if (a.actualValue != null) entry.actual.push(Number(a.actualValue));
    if (a.variancePct != null) entry.variances.push(Number(a.variancePct));
    byName.set(a.assumptionName, entry);
  }

  const biases: AssumptionBias[] = [];
  for (const [name, data] of byName.entries()) {
    if (data.variances.length < 2) continue; // Need at least 2 samples

    const avgProjected =
      Math.round(
        (data.projected.reduce((a, b) => a + b, 0) / data.projected.length) *
          100
      ) / 100;
    const avgActual =
      Math.round(
        (data.actual.reduce((a, b) => a + b, 0) / data.actual.length) * 100
      ) / 100;
    const avgVar =
      Math.round(
        (data.variances.reduce((a, b) => a + b, 0) / data.variances.length) *
          100
      ) / 100;

    biases.push({
      assumptionName: name,
      avgProjected,
      avgActual,
      avgVariancePct: avgVar,
      sampleSize: data.variances.length,
      direction:
        Math.abs(avgVar) < 2
          ? "neutral"
          : avgVar > 0
            ? "over"
            : "under",
    });
  }

  // Sort by absolute variance, largest bias first
  biases.sort((a, b) => Math.abs(b.avgVariancePct) - Math.abs(a.avgVariancePct));
  return biases.slice(0, 10);
}

async function getTriageCalibration(
  orgId: string
): Promise<TriageCalibration[]> {
  // Load triage run outputs + outcomes for org deals
  const runs = await prisma.run.findMany({
    where: {
      deal: { orgId },
      runType: "TRIAGE",
      status: "succeeded",
    },
    include: {
      deal: {
        select: {
          status: true,
          outcome: true,
        },
      },
    },
    orderBy: { finishedAt: "desc" },
  });

  // Deduplicate: keep latest triage per deal (skip runs with no output)
  const byDeal = new Map<string, typeof runs[number]>();
  for (const r of runs) {
    if (!r.dealId || !r.outputJson) continue;
    if (!byDeal.has(r.dealId)) byDeal.set(r.dealId, r);
  }

  // Group by triage tier
  const byTier = new Map<
    string,
    {
      total: number;
      exited: number;
      killed: number;
      irrs: number[];
      ems: number[];
    }
  >();

  for (const [, r] of byDeal.entries()) {
    const output = r.outputJson as Record<string, unknown> | null;
    if (!output) continue;

    const tier =
      typeof output.tier === "string"
        ? output.tier.toUpperCase()
        : typeof output.recommendation === "string"
          ? output.recommendation.toUpperCase()
          : "UNKNOWN";

    const entry = byTier.get(tier) ?? {
      total: 0,
      exited: 0,
      killed: 0,
      irrs: [],
      ems: [],
    };
    entry.total++;

    const deal = r.deal as unknown as {
      status: string;
      outcome: { actualIrr: { toString(): string } | null; actualEquityMultiple: { toString(): string } | null } | null;
    };

    if (deal.status === "EXITED") {
      entry.exited++;
      if (deal.outcome?.actualIrr)
        entry.irrs.push(Number(deal.outcome.actualIrr.toString()));
      if (deal.outcome?.actualEquityMultiple)
        entry.ems.push(Number(deal.outcome.actualEquityMultiple.toString()));
    }
    if (deal.status === "KILLED") entry.killed++;

    byTier.set(tier, entry);
  }

  const result: TriageCalibration[] = [];
  for (const [tier, data] of byTier.entries()) {
    const avg = (arr: number[]) =>
      arr.length > 0
        ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 100) / 100
        : null;

    result.push({
      triageTier: tier,
      totalDeals: data.total,
      exitedDeals: data.exited,
      killedDeals: data.killed,
      avgActualIrr: avg(data.irrs),
      avgActualEquityMultiple: avg(data.ems),
      successRate:
        data.exited + data.killed > 0
          ? Math.round(
              (data.exited / (data.exited + data.killed)) * 100
            )
          : 0,
    });
  }

  // Sort tiers: ADVANCE > HOLD > KILL > UNKNOWN
  const tierOrder: Record<string, number> = {
    ADVANCE: 0,
    A: 0,
    HOLD: 1,
    B: 1,
    KILL: 2,
    C: 2,
    D: 3,
    UNKNOWN: 4,
  };
  result.sort(
    (a, b) =>
      (tierOrder[a.triageTier] ?? 99) - (tierOrder[b.triageTier] ?? 99)
  );

  return result;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[%,$\s,]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toPctPoints(value: number): number {
  return Math.abs(value) <= 1 ? value * 100 : value;
}

function extractPredictedIrr(output: Record<string, unknown>): number | null {
  const direct = asNumber(output.predicted_irr) ?? asNumber(output.projected_irr);
  if (direct !== null) return toPctPoints(direct);

  const financial = asRecord(output.financial_summary);
  if (!financial) return null;
  const nested =
    asNumber(financial.projected_irr) ??
    asNumber(financial.predicted_irr) ??
    asNumber(financial.irr);
  return nested === null ? null : toPctPoints(nested);
}

function extractPredictedTimelineMonths(output: Record<string, unknown>): number | null {
  const direct =
    asNumber(output.predicted_timeline_months) ??
    asNumber(output.timeline_months) ??
    asNumber(output.expected_timeline_months);
  if (direct !== null) return direct;

  const actions = Array.isArray(output.next_actions)
    ? (output.next_actions as Array<Record<string, unknown>>)
    : [];
  if (actions.length === 0) return null;

  const maxDays = actions.reduce((max, action) => {
    const due = asNumber(action.due_in_days);
    if (due === null) return max;
    return Math.max(max, due);
  }, 0);
  if (maxDays <= 0) return null;
  return Math.round((maxDays / 30.4375) * 10) / 10;
}

function extractPredictedRiskScore(output: Record<string, unknown>): number | null {
  const direct =
    asNumber(output.predicted_risk_score) ??
    asNumber(output.risk_score);
  if (direct !== null) {
    return direct <= 1 ? direct * 100 : direct;
  }

  const triageScore = asNumber(output.triageScore);
  if (triageScore !== null) {
    const normalized = triageScore <= 1 ? triageScore * 100 : triageScore;
    return Math.max(0, Math.min(100, 100 - normalized));
  }

  const riskScores = asRecord(output.risk_scores);
  if (!riskScores) return null;
  const values = Object.values(riskScores)
    .map((value) => asNumber(value))
    .filter((value): value is number => value !== null);
  if (values.length === 0) return null;
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.max(0, Math.min(100, avg * 10));
}

async function getPredictionTrackingSummary(
  orgId: string,
): Promise<PredictionTrackingSummary> {
  const runs = await prisma.run.findMany({
    where: {
      runType: "TRIAGE",
      status: "succeeded",
      deal: { orgId },
    },
    include: {
      deal: {
        select: {
          status: true,
          createdAt: true,
          outcome: {
            select: {
              actualIrr: true,
              actualHoldPeriodMonths: true,
              exitDate: true,
            },
          },
        },
      },
    },
    orderBy: { finishedAt: "desc" },
  });

  const latestByDeal = new Map<string, (typeof runs)[number]>();
  for (const run of runs) {
    if (!run.dealId || !run.outputJson) continue;
    if (!latestByDeal.has(run.dealId)) {
      latestByDeal.set(run.dealId, run);
    }
  }

  const irrDiffs: number[] = [];
  const timelineDiffs: number[] = [];
  const riskAccuracies: number[] = [];
  let sampleSize = 0;

  for (const [, run] of latestByDeal.entries()) {
    const output = asRecord(run.outputJson);
    if (!output) continue;
    const deal = run.deal;
    if (!deal) continue;

    const predictedIrr = extractPredictedIrr(output);
    const predictedTimeline = extractPredictedTimelineMonths(output);
    const predictedRiskScore = extractPredictedRiskScore(output);

    const outcome = deal.outcome;
    const actualIrr =
      outcome?.actualIrr != null
        ? toPctPoints(Number(outcome.actualIrr.toString()))
        : null;
    const actualTimeline =
      outcome?.actualHoldPeriodMonths ??
      (outcome?.exitDate
        ? Math.max(
            0,
            Math.round(
              ((new Date(outcome.exitDate).getTime() - deal.createdAt.getTime()) /
                (1000 * 60 * 60 * 24 * 30.4375)) *
                10,
            ) / 10,
          )
        : null);

    if (predictedIrr !== null && actualIrr !== null) {
      irrDiffs.push(predictedIrr - actualIrr);
      sampleSize += 1;
    }
    if (predictedTimeline !== null && actualTimeline !== null) {
      timelineDiffs.push(actualTimeline - predictedTimeline);
    }
    if (predictedRiskScore !== null) {
      const actualRiskOutcome =
        deal.status === "KILLED" ? 100 : deal.status === "EXITED" ? 0 : 50;
      const accuracy = Math.max(
        0,
        100 - Math.abs(predictedRiskScore - actualRiskOutcome),
      );
      riskAccuracies.push(accuracy);
    }
  }

  const avg = (values: number[]): number | null =>
    values.length > 0
      ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100
      : null;

  return {
    avgIrrOverestimatePct: avg(irrDiffs),
    avgTimelineUnderestimateMonths: avg(timelineDiffs),
    riskAccuracyScore: avg(riskAccuracies),
    sampleSize,
  };
}

export async function getHistoricalAccuracy(
  orgId: string
): Promise<{
  biases: AssumptionBias[];
  calibration: TriageCalibration[];
  recommendations: string[];
}> {
  const biases = await getAssumptionBiases(orgId);
  const calibration = await getTriageCalibration(orgId);

  // Generate textual recommendations from biases
  const recommendations: string[] = [];
  for (const b of biases.slice(0, 5)) {
    if (b.direction === "over") {
      recommendations.push(
        `You tend to OVERESTIMATE ${b.assumptionName} by ~${Math.abs(b.avgVariancePct).toFixed(1)}% (n=${b.sampleSize}). Consider reducing projections.`
      );
    } else if (b.direction === "under") {
      recommendations.push(
        `You tend to UNDERESTIMATE ${b.assumptionName} by ~${Math.abs(b.avgVariancePct).toFixed(1)}% (n=${b.sampleSize}). Consider increasing projections.`
      );
    }
  }

  return { biases, calibration, recommendations };
}
