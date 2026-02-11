/**
 * Adaptive Scoring Weights — learns from historical deal outcomes.
 *
 * Moves the scoring system toward AGI by allowing weights to self-adjust
 * based on which triage dimensions best predicted actual deal success/failure.
 *
 * The system tracks outcome records (actual deal results vs predictions)
 * and computes weight adjustments using a simplified gradient approach:
 * dimensions that better correlate with actual outcomes get higher weights.
 *
 * Constraints:
 * - All weights remain positive and sum to 1.0.
 * - Maximum adjustment per dimension is capped (LEARNING_RATE) to prevent
 *   catastrophic drift from a single bad outcome.
 * - A minimum outcome count is required before adaptation kicks in.
 */

import { DEFAULT_WEIGHTS, type ScoringWeights } from "./weights.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single historical outcome record for weight calibration. */
export type OutcomeRecord = {
  /** The triage dimension scores at time of triage (0-100 each). */
  scores: ScoringWeights;
  /** Original triage decision. */
  predictedDecision: "KILL" | "HOLD" | "ADVANCE";
  /** Actual outcome observed after deal completion/abandonment. */
  actualOutcome: "SUCCESS" | "PARTIAL" | "FAILURE";
  /** Original numeric triage score (0-100). */
  predictedScore: number;
};

/** Bias correction data for financial projections. */
export type ProjectionBias = {
  metric: string;
  /** Average ratio of actual / predicted values. <1 means overestimation. */
  meanRatio: number;
  /** Number of observations. */
  sampleSize: number;
  /** Suggested correction multiplier to apply to new projections. */
  correctionFactor: number;
};

/** Calibration showing how triage tiers actually performed. */
export type TierCalibration = {
  tier: "Green" | "Yellow" | "Red";
  totalDeals: number;
  /** Of deals that received this tier, how many actually succeeded. */
  successRate: number;
  /** Of deals that received this tier, how many failed. */
  failureRate: number;
};

/** Full outcome tracking summary returned by the outcome tool. */
export type OutcomeTrackingSummary = {
  totalOutcomes: number;
  projectionBiases: ProjectionBias[];
  tierCalibration: TierCalibration[];
  adaptedWeights: ScoringWeights | null;
  weightAdjustments: Record<string, number> | null;
  confidenceLevel: "insufficient_data" | "low" | "medium" | "high";
};

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Maximum weight adjustment per dimension per adaptation cycle. */
const LEARNING_RATE = 0.03;

/** Minimum outcome records before weights adapt. */
const MIN_OUTCOMES_FOR_ADAPTATION = 5;

/** Minimum weight floor (prevents any dimension from being zeroed). */
const MIN_WEIGHT = 0.02;

// ---------------------------------------------------------------------------
// Core Logic
// ---------------------------------------------------------------------------

/**
 * Map actual outcomes to numeric alignment scores.
 * SUCCESS = 1.0, PARTIAL = 0.5, FAILURE = 0.0.
 */
function outcomeToNumeric(outcome: OutcomeRecord["actualOutcome"]): number {
  switch (outcome) {
    case "SUCCESS":
      return 1.0;
    case "PARTIAL":
      return 0.5;
    case "FAILURE":
      return 0.0;
  }
}

/**
 * Compute per-dimension correlation with outcomes.
 *
 * For each dimension, we compute the Pearson-like alignment:
 * dimensions where high scores correspond to good outcomes
 * (and low scores to bad outcomes) get positive alignment.
 */
function computeDimensionAlignment(
  outcomes: OutcomeRecord[],
): Record<keyof ScoringWeights, number> {
  const dimensions = Object.keys(DEFAULT_WEIGHTS) as (keyof ScoringWeights)[];
  const alignment: Record<string, number> = {};

  for (const dim of dimensions) {
    let sumProduct = 0;
    let sumScoreSq = 0;
    let sumOutcomeSq = 0;
    const meanScore =
      outcomes.reduce((s, o) => s + o.scores[dim], 0) / outcomes.length;
    const meanOutcome =
      outcomes.reduce((s, o) => s + outcomeToNumeric(o.actualOutcome), 0) /
      outcomes.length;

    for (const o of outcomes) {
      const scoreDev = o.scores[dim] - meanScore;
      const outcomeDev = outcomeToNumeric(o.actualOutcome) - meanOutcome;
      sumProduct += scoreDev * outcomeDev;
      sumScoreSq += scoreDev * scoreDev;
      sumOutcomeSq += outcomeDev * outcomeDev;
    }

    const denom = Math.sqrt(sumScoreSq * sumOutcomeSq);
    // Correlation [-1, 1]; default to 0 if degenerate
    alignment[dim] = denom > 0 ? sumProduct / denom : 0;
  }

  return alignment as Record<keyof ScoringWeights, number>;
}

/**
 * Adapt scoring weights based on historical outcomes.
 *
 * Returns null if insufficient data. Otherwise returns adjusted weights
 * that sum to 1.0 and respect the min/max constraints.
 */
export function computeAdaptiveWeights(
  outcomes: OutcomeRecord[],
  baseWeights: ScoringWeights = DEFAULT_WEIGHTS,
): { weights: ScoringWeights; adjustments: Record<string, number> } | null {
  if (outcomes.length < MIN_OUTCOMES_FOR_ADAPTATION) {
    return null;
  }

  const alignment = computeDimensionAlignment(outcomes);
  const dimensions = Object.keys(baseWeights) as (keyof ScoringWeights)[];

  // Compute raw adjustments: boost dimensions with positive correlation,
  // reduce dimensions with negative correlation
  const rawAdjustments: Record<string, number> = {};
  for (const dim of dimensions) {
    // Scale alignment by learning rate, clamped
    rawAdjustments[dim] = Math.max(
      -LEARNING_RATE,
      Math.min(LEARNING_RATE, alignment[dim] * LEARNING_RATE),
    );
  }

  // Apply adjustments
  const adjustedRaw: Record<string, number> = {};
  for (const dim of dimensions) {
    adjustedRaw[dim] = Math.max(MIN_WEIGHT, baseWeights[dim] + rawAdjustments[dim]);
  }

  // Normalize to sum to 1.0
  const totalRaw = Object.values(adjustedRaw).reduce((s, v) => s + v, 0);
  const normalizedWeights: Record<string, number> = {};
  const adjustments: Record<string, number> = {};

  // Round all but the last dimension, then compute last as remainder to ensure exact sum
  const lastDim = dimensions[dimensions.length - 1];
  let runningSum = 0;
  for (const dim of dimensions) {
    if (dim === lastDim) continue;
    normalizedWeights[dim] = Math.round((adjustedRaw[dim] / totalRaw) * 10000) / 10000;
    runningSum += normalizedWeights[dim];
  }
  normalizedWeights[lastDim] = Math.round((1.0 - runningSum) * 10000) / 10000;

  for (const dim of dimensions) {
    adjustments[dim] =
      Math.round((normalizedWeights[dim] - baseWeights[dim]) * 10000) / 10000;
  }

  return {
    weights: normalizedWeights as unknown as ScoringWeights,
    adjustments,
  };
}

/**
 * Compute projection bias corrections from historical data.
 *
 * Analyzes patterns like "we consistently overestimate rent growth by 12%"
 * and provides correction factors for future projections.
 */
export function computeProjectionBiases(
  actuals: Array<{ metric: string; predicted: number; actual: number }>,
): ProjectionBias[] {
  // Group by metric
  const byMetric = new Map<string, Array<{ predicted: number; actual: number }>>();
  for (const entry of actuals) {
    if (!byMetric.has(entry.metric)) {
      byMetric.set(entry.metric, []);
    }
    byMetric.get(entry.metric)!.push({
      predicted: entry.predicted,
      actual: entry.actual,
    });
  }

  const biases: ProjectionBias[] = [];
  for (const [metric, records] of byMetric) {
    if (records.length === 0) continue;

    const ratios = records
      .filter((r) => r.predicted !== 0)
      .map((r) => r.actual / r.predicted);

    if (ratios.length === 0) continue;

    const meanRatio = ratios.reduce((s, r) => s + r, 0) / ratios.length;
    // Correction factor: if we overestimate (ratio < 1), multiply future by ratio
    // Clamp to prevent extreme corrections
    const correctionFactor = Math.max(0.5, Math.min(1.5, meanRatio));

    biases.push({
      metric,
      meanRatio: Math.round(meanRatio * 1000) / 1000,
      sampleSize: ratios.length,
      correctionFactor: Math.round(correctionFactor * 1000) / 1000,
    });
  }

  return biases;
}

/**
 * Compute tier calibration statistics from outcome data.
 */
export function computeTierCalibration(
  outcomes: OutcomeRecord[],
): TierCalibration[] {
  const tierMap: Record<string, { total: number; success: number; failure: number }> = {
    Green: { total: 0, success: 0, failure: 0 },
    Yellow: { total: 0, success: 0, failure: 0 },
    Red: { total: 0, success: 0, failure: 0 },
  };

  for (const o of outcomes) {
    let tier: string;
    if (o.predictedScore >= 70) tier = "Green";
    else if (o.predictedScore >= 40) tier = "Yellow";
    else tier = "Red";

    tierMap[tier].total++;
    if (o.actualOutcome === "SUCCESS") tierMap[tier].success++;
    else if (o.actualOutcome === "FAILURE") tierMap[tier].failure++;
  }

  return (["Green", "Yellow", "Red"] as const).map((tier) => ({
    tier,
    totalDeals: tierMap[tier].total,
    successRate:
      tierMap[tier].total > 0
        ? Math.round((tierMap[tier].success / tierMap[tier].total) * 1000) / 1000
        : 0,
    failureRate:
      tierMap[tier].total > 0
        ? Math.round((tierMap[tier].failure / tierMap[tier].total) * 1000) / 1000
        : 0,
  }));
}

/**
 * Build a complete outcome tracking summary suitable for agent consumption.
 */
export function buildOutcomeTrackingSummary(
  outcomes: OutcomeRecord[],
  projectionActuals: Array<{ metric: string; predicted: number; actual: number }>,
  baseWeights: ScoringWeights = DEFAULT_WEIGHTS,
): OutcomeTrackingSummary {
  const adapted = computeAdaptiveWeights(outcomes, baseWeights);
  const biases = computeProjectionBiases(projectionActuals);
  const calibration = computeTierCalibration(outcomes);

  let confidenceLevel: OutcomeTrackingSummary["confidenceLevel"];
  if (outcomes.length < MIN_OUTCOMES_FOR_ADAPTATION) {
    confidenceLevel = "insufficient_data";
  } else if (outcomes.length < 15) {
    confidenceLevel = "low";
  } else if (outcomes.length < 50) {
    confidenceLevel = "medium";
  } else {
    confidenceLevel = "high";
  }

  return {
    totalOutcomes: outcomes.length,
    projectionBiases: biases,
    tierCalibration: calibration,
    adaptedWeights: adapted?.weights ?? null,
    weightAdjustments: adapted?.adjustments ?? null,
    confidenceLevel,
  };
}
