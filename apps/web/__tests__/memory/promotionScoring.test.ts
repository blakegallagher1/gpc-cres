import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { computePromotionScore } from "@/lib/services/promotionScoring";
import type { ConfidenceVector } from "@/lib/services/confidenceScoring";
import { PROMOTION_WEIGHTS, ANOMALY_PENALTY_COEFF } from "@/lib/services/promotionConfig";

const makeVector = (overrides: Partial<ConfidenceVector> = {}): ConfidenceVector => ({
  structural_confidence: 0.8,
  source_reliability_score: 0.9,
  cross_memory_agreement_score: 0.7,
  calibration_support_score: 0.6,
  anomaly_score: 0,
  ...overrides,
});

describe("computePromotionScore", () => {
  it("computes weighted sum without anomaly penalty when anomaly_score is 0", () => {
    const vector = makeVector({ anomaly_score: 0 });
    const result = computePromotionScore(vector);

    const expectedSum =
      PROMOTION_WEIGHTS.structural_confidence * 0.8 +
      PROMOTION_WEIGHTS.source_reliability_score * 0.9 +
      PROMOTION_WEIGHTS.cross_memory_agreement_score * 0.7 +
      PROMOTION_WEIGHTS.calibration_support_score * 0.6;

    expect(result.score).toBeCloseTo(expectedSum, 4);
    expect(result.anomalyPenalty).toBe(0);
  });

  it("applies anomaly penalty", () => {
    const vector = makeVector({ anomaly_score: 0.5 });
    const result = computePromotionScore(vector);

    expect(result.anomalyPenalty).toBeCloseTo(ANOMALY_PENALTY_COEFF * 0.5, 4);

    const withoutPenalty = computePromotionScore(makeVector({ anomaly_score: 0 }));
    expect(result.score).toBeLessThan(withoutPenalty.score);
  });

  it("clamps score to [0, 1]", () => {
    // Perfect vector, no anomaly
    const perfect = makeVector({
      structural_confidence: 1,
      source_reliability_score: 1,
      cross_memory_agreement_score: 1,
      calibration_support_score: 1,
      anomaly_score: 0,
    });
    const result = computePromotionScore(perfect);
    expect(result.score).toBeLessThanOrEqual(1);
    expect(result.score).toBeGreaterThanOrEqual(0);

    // Worst case: all zeros with high anomaly
    const worst = makeVector({
      structural_confidence: 0,
      source_reliability_score: 0,
      cross_memory_agreement_score: 0,
      calibration_support_score: 0,
      anomaly_score: 1,
    });
    const worstResult = computePromotionScore(worst);
    expect(worstResult.score).toBe(0);
  });

  it("returns per-dimension contributions", () => {
    const vector = makeVector();
    const result = computePromotionScore(vector);

    expect(result.dimensionContributions).toHaveProperty("structural_confidence");
    expect(result.dimensionContributions).toHaveProperty("source_reliability_score");
    expect(result.dimensionContributions).toHaveProperty("cross_memory_agreement_score");
    expect(result.dimensionContributions).toHaveProperty("calibration_support_score");

    expect(result.dimensionContributions.structural_confidence).toBeCloseTo(
      PROMOTION_WEIGHTS.structural_confidence * 0.8,
      4,
    );
  });
});
