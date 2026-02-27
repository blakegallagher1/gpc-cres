import "server-only";

import type { ConfidenceVector } from "./confidenceScoring";
import {
  PROMOTION_WEIGHTS,
  ANOMALY_PENALTY_COEFF,
} from "./promotionConfig";

/**
 * Promotion scoring — weighted linear combination of confidence dimensions.
 *
 * promotionScore = Σ(weight_i * dimension_i) - ANOMALY_PENALTY_COEFF * anomaly_score
 *
 * Score range: [0, 1] (clamped).
 */

export interface PromotionResult {
  score: number;
  dimensionContributions: Record<string, number>;
  anomalyPenalty: number;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Compute the promotion score from a confidence vector.
 */
export function computePromotionScore(vector: ConfidenceVector): PromotionResult {
  const contributions: Record<string, number> = {};

  let weightedSum = 0;
  for (const [key, weight] of Object.entries(PROMOTION_WEIGHTS)) {
    const dimValue = vector[key as keyof typeof PROMOTION_WEIGHTS];
    const contribution = weight * dimValue;
    contributions[key] = contribution;
    weightedSum += contribution;
  }

  const anomalyPenalty = ANOMALY_PENALTY_COEFF * vector.anomaly_score;
  const rawScore = weightedSum - anomalyPenalty;

  return {
    score: clamp01(rawScore),
    dimensionContributions: contributions,
    anomalyPenalty,
  };
}
