/**
 * Main triage scoring engine.
 *
 * Implements two scoring systems:
 *
 * 1. Site-level triage: weighted 0-100 scores across 8 dimensions (access,
 *    drainage, adjacency, etc.) producing a KILL / HOLD / ADVANCE decision.
 *
 * 2. Financial screening: 1-5 band-based scoring with 50/50 financial vs
 *    qualitative weighting, ported from legacy/python/tools/screening.py.
 *
 * Both share the same hard-filter layer.
 */

import type { HardFilterResult } from "./hardFilters.js";
import { scoreFromThresholds } from "./bands.js";
import {
  DEFAULT_WEIGHTS,
  DEFAULT_SCORING_BANDS,
  type ScoringWeights,
  type ScoringBands,
  type DealScoringWeights as DealScoringWeightsType,
  DEFAULT_DEAL_WEIGHTS,
} from "./weights.js";
import {
  DEFAULT_FINANCIAL_HARD_FILTERS,
  financialHardFilterCheck,
  type FinancialHardFilterThresholds,
} from "./hardFilters.js";

// ---------------------------------------------------------------------------
// 1. Site-level triage (0-100 weighted scores)
// ---------------------------------------------------------------------------

export type TriageInput = {
  accessScore?: number; // 0-100
  drainageScore?: number; // 0-100
  adjacencyScore?: number; // 0-100
  environmentalScore?: number; // 0-100
  utilitiesScore?: number; // 0-100
  politicsScore?: number; // 0-100
  zoningScore?: number; // 0-100
  acreageScore?: number; // 0-100
  hardFilterResult?: HardFilterResult;
};

export type TriageResult = {
  decision: "KILL" | "HOLD" | "ADVANCE";
  numericScore: number; // 0-100
  tier: "Green" | "Yellow" | "Red" | "Gray";
  breakdown: Record<string, { score: number; weight: number; weighted: number }>;
  disqualifiers: string[];
  missingData: string[];
  isProvisional: boolean; // true if any scores are missing
};

const DIMENSION_KEYS = [
  "access",
  "drainage",
  "adjacency",
  "environmental",
  "utilities",
  "politics",
  "zoning",
  "acreage",
] as const;

type DimensionKey = (typeof DIMENSION_KEYS)[number];

/**
 * Compute weighted triage score with missing-data handling.
 *
 * - Hard filter failure -> KILL immediately.
 * - Score >= 70 -> ADVANCE (Green)
 * - Score 40-69 -> HOLD (Yellow)
 * - Score < 40 -> KILL (Red)
 * - Missing data -> Gray (provisional)
 */
export function computeTriageScore(
  input: TriageInput,
  weights: ScoringWeights = DEFAULT_WEIGHTS,
): TriageResult {
  // Map input fields to dimension keys
  const scoreMap: Record<DimensionKey, number | undefined> = {
    access: input.accessScore,
    drainage: input.drainageScore,
    adjacency: input.adjacencyScore,
    environmental: input.environmentalScore,
    utilities: input.utilitiesScore,
    politics: input.politicsScore,
    zoning: input.zoningScore,
    acreage: input.acreageScore,
  };

  // Hard filter check
  const disqualifiers = input.hardFilterResult?.disqualifiers ?? [];
  if (input.hardFilterResult && !input.hardFilterResult.passed) {
    // Build breakdown from whatever data we have
    const breakdown: Record<string, { score: number; weight: number; weighted: number }> = {};
    for (const key of DIMENSION_KEYS) {
      const score = scoreMap[key] ?? 0;
      breakdown[key] = { score, weight: weights[key], weighted: score * weights[key] };
    }
    return {
      decision: "KILL",
      numericScore: 0,
      tier: "Red",
      breakdown,
      disqualifiers,
      missingData: DIMENSION_KEYS.filter((k) => scoreMap[k] == null),
      isProvisional: false,
    };
  }

  // Build breakdown and track missing data
  const missingData: string[] = [];
  const breakdown: Record<string, { score: number; weight: number; weighted: number }> = {};
  let totalWeight = 0;
  let weightedSum = 0;

  for (const key of DIMENSION_KEYS) {
    const rawScore = scoreMap[key];
    if (rawScore == null) {
      missingData.push(key);
      breakdown[key] = { score: 0, weight: weights[key], weighted: 0 };
      continue;
    }
    const score = Math.max(0, Math.min(100, rawScore));
    const w = weights[key];
    const weighted = score * w;
    breakdown[key] = { score, weight: w, weighted };
    totalWeight += w;
    weightedSum += weighted;
  }

  // Normalize: exclude missing dimensions from denominator
  const numericScore = totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 100) / 100 : 0;

  const isProvisional = missingData.length > 0;

  let decision: "KILL" | "HOLD" | "ADVANCE";
  let tier: "Green" | "Yellow" | "Red" | "Gray";

  if (isProvisional) {
    tier = "Gray";
    // Still compute a provisional decision
    if (numericScore >= 70) {
      decision = "ADVANCE";
    } else if (numericScore >= 40) {
      decision = "HOLD";
    } else {
      decision = "KILL";
    }
  } else if (numericScore >= 70) {
    decision = "ADVANCE";
    tier = "Green";
  } else if (numericScore >= 40) {
    decision = "HOLD";
    tier = "Yellow";
  } else {
    decision = "KILL";
    tier = "Red";
  }

  return {
    decision,
    numericScore,
    tier,
    breakdown,
    disqualifiers,
    missingData,
    isProvisional,
  };
}

// ---------------------------------------------------------------------------
// 2. Financial screening (1-5 band scale, 50/50 weighting)
//    Ported from legacy/python/tools/screening.py compute_screening()
// ---------------------------------------------------------------------------

export type DebtTemplate = {
  ltv: number; // 0-1, default 0.65
  interestRate: number; // decimal, default 0.07
  amortYears: number; // default 25
  ioYears: number; // default 0
  debtFeeRate: number; // default 0.01
};

export type ClosingCostsTemplate = {
  legalPct: number; // default 0.005
  titlePct: number; // default 0.003
  dueDiligenceFlat: number; // default 25000
};

export type ReservesTemplate = {
  capexReservePerSfYear: number; // default 0.25
};

export type ScreeningPlaybook = {
  lowConfidenceThreshold: number; // default 0.70
  hardFilters: FinancialHardFilterThresholds;
  debtTemplate: DebtTemplate;
  closingCosts: ClosingCostsTemplate;
  reserves: ReservesTemplate;
  scoringBands: ScoringBands;
};

export const DEFAULT_PLAYBOOK: ScreeningPlaybook = {
  lowConfidenceThreshold: 0.70,
  hardFilters: DEFAULT_FINANCIAL_HARD_FILTERS,
  debtTemplate: {
    ltv: 0.65,
    interestRate: 0.07,
    amortYears: 25,
    ioYears: 0,
    debtFeeRate: 0.01,
  },
  closingCosts: {
    legalPct: 0.005,
    titlePct: 0.003,
    dueDiligenceFlat: 25_000,
  },
  reserves: {
    capexReservePerSfYear: 0.25,
  },
  scoringBands: DEFAULT_SCORING_BANDS,
};

export type ScreeningScoringInputs = {
  priceBasis?: number | null;
  totalProjectCost?: number | null;
  squareFeet?: number | null;
  noiInPlace?: number | null;
  noiStabilized?: number | null;
  tenantCreditScore?: number | null; // 1-5
  assetConditionScore?: number | null; // 1-5
  marketDynamicsScore?: number | null; // 1-5
};

export type ScreeningComputedMetrics = {
  priceBasis: number | null;
  totalCost: number | null;
  loanAmount: number | null;
  equityInvested: number | null;
  loanConstant: number | null;
  annualDebtService: number | null;
  annualReserves: number | null;
  capRateInPlace: number | null;
  capRateStabilized: number | null;
  capRateUsed: number | null;
  noiUsed: number | null;
  yieldOnCost: number | null;
  yieldSpread: number | null;
  dscr: number | null;
  cashOnCash: number | null;
};

export type ScreeningScoreBreakdown = {
  overallScore: number | null;
  financialScore: number | null;
  qualitativeScore: number | null;
  isProvisional: boolean;
  hardFilterFailed: boolean;
  hardFilterReasons: string[];
  missingKeys: string[];
  metricScores: Record<string, number | null>;
  metricValues: Record<string, number | null>;
};

export type ScreeningComputation = {
  metrics: ScreeningComputedMetrics;
  scores: ScreeningScoreBreakdown;
};

// ---------------------------------------------------------------------------
// Helpers (ported from Python)
// ---------------------------------------------------------------------------

function isNumber(value: unknown): value is number {
  return typeof value === "number" && !Number.isNaN(value);
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

function safeDiv(numerator: number | null, denominator: number | null): number | null {
  if (numerator == null || denominator == null || denominator === 0) return null;
  return numerator / denominator;
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function roundOrNull(value: number | null, digits = 4): number | null {
  if (value == null) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * Compute the amortizing loan constant (annual debt service / principal).
 *
 * Ported from Python screening.py `loan_constant()`.
 */
export function loanConstant(annualRate: number, amortYears: number): number {
  if (amortYears <= 0) throw new Error("amortYears must be positive");

  if (annualRate <= 0) return 1.0 / amortYears;

  const monthlyRate = annualRate / 12.0;
  const periods = amortYears * 12;
  const factor =
    (monthlyRate * Math.pow(1.0 + monthlyRate, periods)) /
    (Math.pow(1.0 + monthlyRate, periods) - 1.0);
  return factor * 12.0;
}

/**
 * Compute v1 screening metrics and 1-5 score.
 *
 * Faithfully ported from legacy/python/tools/screening.py `compute_screening()`.
 *
 * Notes:
 * - Cap rate = NOI / price (standard definition).
 * - When both in-place and stabilized NOI are present, stabilized is used
 *   for scoring and hard filters; both are returned for display.
 * - Missing values are excluded from group averages (no penalty).
 */
export function computeScreening(
  inputs: ScreeningScoringInputs,
  playbook: ScreeningPlaybook = DEFAULT_PLAYBOOK,
): ScreeningComputation {
  const missingKeys: string[] = [];

  const priceBasis = isNumber(inputs.priceBasis) ? inputs.priceBasis : null;
  if (priceBasis == null) missingKeys.push("price_basis");

  const squareFeet = isNumber(inputs.squareFeet) ? inputs.squareFeet : null;
  if (squareFeet == null) missingKeys.push("square_feet");

  const noiInPlace = isNumber(inputs.noiInPlace) ? inputs.noiInPlace : null;
  const noiStabilized = isNumber(inputs.noiStabilized) ? inputs.noiStabilized : null;
  if (noiInPlace == null) missingKeys.push("noi_in_place");
  if (noiStabilized == null) missingKeys.push("noi_stabilized");

  // Choose NOI for different uses
  const noiForCap = noiStabilized ?? noiInPlace;
  const noiForCashflow = noiInPlace ?? noiStabilized;

  const capRateInPlace = safeDiv(noiInPlace, priceBasis);
  const capRateStabilized = safeDiv(noiStabilized, priceBasis);
  const capRateUsed = safeDiv(noiForCap, priceBasis);

  const debt = playbook.debtTemplate;
  const closing = playbook.closingCosts;

  const loanAmt = priceBasis != null ? priceBasis * debt.ltv : null;
  const lc = loanAmt != null ? loanConstant(debt.interestRate, debt.amortYears) : null;
  const annualDebtService = loanAmt != null && lc != null ? loanAmt * lc : null;

  let totalCost = isNumber(inputs.totalProjectCost) ? inputs.totalProjectCost : null;
  if (totalCost == null && priceBasis != null && loanAmt != null) {
    // Provisional total cost derived from plan defaults
    const debtFees = loanAmt * debt.debtFeeRate;
    totalCost =
      priceBasis +
      priceBasis * closing.legalPct +
      priceBasis * closing.titlePct +
      closing.dueDiligenceFlat +
      debtFees;
  }

  const equity = totalCost != null && loanAmt != null ? totalCost - loanAmt : null;

  const reserves = squareFeet != null ? squareFeet * playbook.reserves.capexReservePerSfYear : null;

  const noiAfterReserves =
    noiForCashflow != null && reserves != null ? noiForCashflow - reserves : null;

  const dscr = safeDiv(noiAfterReserves, annualDebtService);

  const yieldOnCost = safeDiv(noiForCap, totalCost);

  const yieldSpread = yieldOnCost != null && lc != null ? yieldOnCost - lc : null;

  const cashFlowAfterDebt =
    noiAfterReserves != null && annualDebtService != null
      ? noiAfterReserves - annualDebtService
      : null;
  const cashOnCash =
    cashFlowAfterDebt != null && equity != null && equity > 0 ? cashFlowAfterDebt / equity : null;

  // Qualitative inputs: already 1-5, clamp into range
  const qualScores: Record<string, number | null> = {};
  const qualEntries: [string, number | null | undefined][] = [
    ["tenant_credit", inputs.tenantCreditScore],
    ["asset_condition", inputs.assetConditionScore],
    ["market_dynamics", inputs.marketDynamicsScore],
  ];
  for (const [key, raw] of qualEntries) {
    if (raw == null || !isNumber(raw)) {
      missingKeys.push(key);
      qualScores[key] = null;
    } else {
      qualScores[key] = clamp(raw, 1.0, 5.0);
    }
  }

  // Score each metric (1-5). Missing => null (excluded from averages).
  const bands = playbook.scoringBands;
  const metricValues: Record<string, number | null> = {
    cap_rate_in_place: capRateInPlace,
    cap_rate_stabilized: capRateStabilized,
    cap_rate_used: capRateUsed,
    yield_on_cost: yieldOnCost,
    yield_spread: yieldSpread,
    cash_on_cash: cashOnCash,
    dscr: dscr,
    loan_constant: lc,
  };

  const metricScores: Record<string, number | null> = {
    cap_rate: scoreFromThresholds(capRateUsed, bands.capRate),
    yield_on_cost: scoreFromThresholds(yieldOnCost, bands.yieldOnCost),
    cash_on_cash: scoreFromThresholds(cashOnCash, bands.cashOnCash),
    dscr: scoreFromThresholds(dscr, bands.dscr),
    ...qualScores,
  };

  const financialKeys = ["cap_rate", "yield_on_cost", "cash_on_cash", "dscr"];
  const qualitativeKeys = ["tenant_credit", "asset_condition", "market_dynamics"];

  const financialComponents = financialKeys
    .map((k) => metricScores[k])
    .filter((v): v is number => v != null);
  const qualitativeComponents = qualitativeKeys
    .map((k) => metricScores[k])
    .filter((v): v is number => v != null);

  const financialScore = avg(financialComponents);
  const qualitativeScore = avg(qualitativeComponents);

  let overallScore: number | null = null;
  if (financialScore != null && qualitativeScore != null) {
    overallScore = 0.5 * financialScore + 0.5 * qualitativeScore;
  } else {
    // Missing group does not penalize: use the available group score
    overallScore = financialScore ?? qualitativeScore;
  }

  // Provisional if any required scoring components are missing
  const requiredMetricKeys = [
    "cap_rate",
    "yield_on_cost",
    "cash_on_cash",
    "dscr",
    "tenant_credit",
    "asset_condition",
    "market_dynamics",
  ];
  const isProvisional = requiredMetricKeys.some((k) => metricScores[k] == null);

  // Hard filters (only fail when value is present)
  const hardResult = financialHardFilterCheck(
    { dscr, capRate: capRateUsed, yieldSpread },
    playbook.hardFilters,
  );

  // Round for storage/display consistency
  const metrics: ScreeningComputedMetrics = {
    priceBasis: roundOrNull(priceBasis),
    totalCost: roundOrNull(totalCost),
    loanAmount: roundOrNull(loanAmt),
    equityInvested: roundOrNull(equity),
    loanConstant: roundOrNull(lc),
    annualDebtService: roundOrNull(annualDebtService),
    annualReserves: roundOrNull(reserves),
    capRateInPlace: roundOrNull(capRateInPlace),
    capRateStabilized: roundOrNull(capRateStabilized),
    capRateUsed: roundOrNull(capRateUsed),
    noiUsed: roundOrNull(noiForCap),
    yieldOnCost: roundOrNull(yieldOnCost),
    yieldSpread: roundOrNull(yieldSpread),
    dscr: roundOrNull(dscr),
    cashOnCash: roundOrNull(cashOnCash),
  };

  const roundedMetricScores: Record<string, number | null> = {};
  for (const [k, v] of Object.entries(metricScores)) {
    roundedMetricScores[k] = v != null ? Math.round(v * 100) / 100 : null;
  }

  const roundedMetricValues: Record<string, number | null> = {};
  for (const [k, v] of Object.entries(metricValues)) {
    roundedMetricValues[k] = roundOrNull(v);
  }

  // Deduplicate and sort missing keys
  const uniqueMissingKeys = [...new Set(missingKeys)].sort();

  const scores: ScreeningScoreBreakdown = {
    overallScore: overallScore != null ? Math.round(overallScore * 100) / 100 : null,
    financialScore: financialScore != null ? Math.round(financialScore * 100) / 100 : null,
    qualitativeScore: qualitativeScore != null ? Math.round(qualitativeScore * 100) / 100 : null,
    isProvisional,
    hardFilterFailed: !hardResult.passed,
    hardFilterReasons: hardResult.disqualifiers,
    missingKeys: uniqueMissingKeys,
    metricScores: roundedMetricScores,
    metricValues: roundedMetricValues,
  };

  return { metrics, scores };
}

// ---------------------------------------------------------------------------
// Deal screener weighted scoring (from deal_screener.py)
// ---------------------------------------------------------------------------

/** Re-exported from weights module. */
export type { DealScoringWeightsType as DealScoringWeights };

export const DEFAULT_DEAL_SCORING_WEIGHTS: DealScoringWeightsType = { ...DEFAULT_DEAL_WEIGHTS };

/**
 * Normalize a score to 0-100. Values <= 1 are treated as decimals and
 * multiplied by 100. Ported from deal_screener.py `_normalize_score`.
 */
function normalizeScore(value: number | null | undefined): number {
  if (value == null) return 0.0;
  let v = value;
  if (v <= 1) v = v * 100;
  if (v < 0) return 0.0;
  if (v > 100) return 100.0;
  return v;
}

export type DealScoringResult = {
  rawScores: Record<string, number>;
  normalizedScores: Record<string, number>;
  weightedScores: Record<string, number>;
  totalScore: number;
  tier: "A" | "B" | "C" | "D";
  weights: DealScoringWeightsType;
};

/**
 * Compute weighted deal score with tier classification.
 *
 * Ported from deal_screener.py `compute_weighted_score`.
 */
export function computeWeightedDealScore(
  scores: Record<string, number>,
  weights?: Partial<DealScoringWeightsType>,
): DealScoringResult {
  const resolvedWeights: DealScoringWeightsType = {
    ...DEFAULT_DEAL_SCORING_WEIGHTS,
    ...weights,
  };

  const keys = Object.keys(resolvedWeights) as (keyof DealScoringWeightsType)[];

  const normalizedScores: Record<string, number> = {};
  const weightedScores: Record<string, number> = {};

  for (const key of keys) {
    normalizedScores[key] = normalizeScore(scores[key] ?? null);
    weightedScores[key] = normalizedScores[key] * resolvedWeights[key];
  }

  const totalScore = Math.round(Object.values(weightedScores).reduce((s, v) => s + v, 0) * 100) / 100;

  let tier: "A" | "B" | "C" | "D";
  if (totalScore >= 85) tier = "A";
  else if (totalScore >= 70) tier = "B";
  else if (totalScore >= 55) tier = "C";
  else tier = "D";

  return {
    rawScores: scores,
    normalizedScores,
    weightedScores,
    totalScore,
    tier,
    weights: resolvedWeights,
  };
}
