import "server-only";

import type { ConfidenceVector } from "./confidenceScoring";
import type { PromotionResult } from "./promotionScoring";
import type { ThresholdResult } from "./dynamicThreshold";

/**
 * Generates human-readable explanations for promotion decisions.
 * Used in audit trails and the command-center UI.
 */

export interface PromotionDecision {
  promoted: boolean;
  score: number;
  threshold: number;
  explanation: string;
  factors: string[];
}

const DIMENSION_LABELS: Record<string, string> = {
  structural_confidence: "Payload completeness",
  source_reliability_score: "Source reliability",
  cross_memory_agreement_score: "Cross-memory agreement",
  calibration_support_score: "Calibration support",
};

export function explainPromotionDecision(
  vector: ConfidenceVector,
  promotion: PromotionResult,
  thresholdResult: ThresholdResult,
): PromotionDecision {
  const promoted = promotion.score >= thresholdResult.threshold;
  const factors: string[] = [];

  // Identify strongest and weakest dimensions
  const entries = Object.entries(promotion.dimensionContributions).sort(
    (a, b) => b[1] - a[1],
  );

  const strongest = entries[0];
  const weakest = entries[entries.length - 1];

  if (strongest) {
    const label = DIMENSION_LABELS[strongest[0]] ?? strongest[0];
    factors.push(`Strongest factor: ${label} (${(strongest[1] * 100).toFixed(1)}% contribution)`);
  }

  if (weakest && weakest[0] !== strongest?.[0]) {
    const label = DIMENSION_LABELS[weakest[0]] ?? weakest[0];
    factors.push(`Weakest factor: ${label} (${(weakest[1] * 100).toFixed(1)}% contribution)`);
  }

  // Anomaly penalty
  if (promotion.anomalyPenalty > 0) {
    factors.push(
      `Anomaly penalty: -${(promotion.anomalyPenalty * 100).toFixed(1)}% (anomaly_score=${vector.anomaly_score.toFixed(2)})`,
    );
  }

  // Threshold adjustments
  for (const [key, adj] of Object.entries(thresholdResult.adjustments)) {
    if (adj > 0) {
      factors.push(`Threshold raised by ${(adj * 100).toFixed(1)}% due to ${key}`);
    }
  }

  const explanation = promoted
    ? `Promoted: score ${(promotion.score * 100).toFixed(1)}% ≥ threshold ${(thresholdResult.threshold * 100).toFixed(1)}%`
    : `Not promoted: score ${(promotion.score * 100).toFixed(1)}% < threshold ${(thresholdResult.threshold * 100).toFixed(1)}%`;

  return {
    promoted,
    score: promotion.score,
    threshold: thresholdResult.threshold,
    explanation,
    factors,
  };
}
