import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { explainPromotionDecision } from "@/lib/services/promotionExplainer";
import type { ConfidenceVector } from "@/lib/services/confidenceScoring";
import type { PromotionResult } from "@/lib/services/promotionScoring";
import type { ThresholdResult } from "@/lib/services/dynamicThreshold";

const makeVector = (overrides: Partial<ConfidenceVector> = {}): ConfidenceVector => ({
  structural_confidence: 0.8,
  source_reliability_score: 0.9,
  cross_memory_agreement_score: 0.7,
  calibration_support_score: 0.6,
  anomaly_score: 0,
  ...overrides,
});

describe("explainPromotionDecision", () => {
  it("marks promoted when score >= threshold", () => {
    const vector = makeVector();
    const promotion: PromotionResult = {
      score: 0.75,
      dimensionContributions: {
        structural_confidence: 0.24,
        source_reliability_score: 0.225,
        cross_memory_agreement_score: 0.175,
        calibration_support_score: 0.12,
      },
      anomalyPenalty: 0,
    };
    const threshold: ThresholdResult = {
      threshold: 0.65,
      baseThreshold: 0.65,
      adjustments: {},
    };

    const result = explainPromotionDecision(vector, promotion, threshold);

    expect(result.promoted).toBe(true);
    expect(result.score).toBe(0.75);
    expect(result.threshold).toBe(0.65);
    expect(result.explanation).toContain("Promoted");
  });

  it("marks not promoted when score < threshold", () => {
    const vector = makeVector();
    const promotion: PromotionResult = {
      score: 0.55,
      dimensionContributions: {
        structural_confidence: 0.15,
        source_reliability_score: 0.15,
        cross_memory_agreement_score: 0.15,
        calibration_support_score: 0.1,
      },
      anomalyPenalty: 0,
    };
    const threshold: ThresholdResult = {
      threshold: 0.65,
      baseThreshold: 0.65,
      adjustments: {},
    };

    const result = explainPromotionDecision(vector, promotion, threshold);

    expect(result.promoted).toBe(false);
    expect(result.explanation).toContain("Not promoted");
  });

  it("includes anomaly penalty in factors when present", () => {
    const vector = makeVector({ anomaly_score: 0.5 });
    const promotion: PromotionResult = {
      score: 0.65,
      dimensionContributions: {
        structural_confidence: 0.24,
        source_reliability_score: 0.225,
        cross_memory_agreement_score: 0.175,
        calibration_support_score: 0.12,
      },
      anomalyPenalty: 0.075,
    };
    const threshold: ThresholdResult = {
      threshold: 0.65,
      baseThreshold: 0.65,
      adjustments: {},
    };

    const result = explainPromotionDecision(vector, promotion, threshold);

    expect(result.factors.some((f) => f.includes("Anomaly penalty"))).toBe(true);
  });

  it("includes threshold adjustments in factors", () => {
    const vector = makeVector();
    const promotion: PromotionResult = {
      score: 0.70,
      dimensionContributions: {
        structural_confidence: 0.24,
        source_reliability_score: 0.225,
        cross_memory_agreement_score: 0.175,
        calibration_support_score: 0.12,
      },
      anomalyPenalty: 0,
    };
    const threshold: ThresholdResult = {
      threshold: 0.70,
      baseThreshold: 0.65,
      adjustments: { volatility: 0.05 },
    };

    const result = explainPromotionDecision(vector, promotion, threshold);

    expect(result.factors.some((f) => f.includes("volatility"))).toBe(true);
  });

  it("identifies strongest and weakest factors", () => {
    const vector = makeVector();
    const promotion: PromotionResult = {
      score: 0.75,
      dimensionContributions: {
        structural_confidence: 0.24,
        source_reliability_score: 0.225,
        cross_memory_agreement_score: 0.175,
        calibration_support_score: 0.12,
      },
      anomalyPenalty: 0,
    };
    const threshold: ThresholdResult = {
      threshold: 0.65,
      baseThreshold: 0.65,
      adjustments: {},
    };

    const result = explainPromotionDecision(vector, promotion, threshold);

    expect(result.factors.some((f) => f.includes("Strongest factor"))).toBe(true);
    expect(result.factors.some((f) => f.includes("Weakest factor"))).toBe(true);
  });
});
