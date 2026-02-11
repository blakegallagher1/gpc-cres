import { describe, expect, it } from "vitest";

import {
  computeAdaptiveWeights,
  computeProjectionBiases,
  computeTierCalibration,
  buildOutcomeTrackingSummary,
  type OutcomeRecord,
} from "../src/scoring/adaptiveWeights.js";
import { DEFAULT_WEIGHTS } from "../src/scoring/weights.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOutcome(
  overrides: Partial<OutcomeRecord> = {},
): OutcomeRecord {
  return {
    scores: {
      access: 80,
      drainage: 70,
      adjacency: 60,
      environmental: 85,
      utilities: 75,
      politics: 50,
      zoning: 80,
      acreage: 65,
    },
    predictedDecision: "ADVANCE",
    actualOutcome: "SUCCESS",
    predictedScore: 75,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// computeAdaptiveWeights
// ---------------------------------------------------------------------------

describe("computeAdaptiveWeights", () => {
  it("returns null when insufficient outcome data (< 5)", () => {
    const outcomes = [makeOutcome(), makeOutcome(), makeOutcome()];
    const result = computeAdaptiveWeights(outcomes);
    expect(result).toBeNull();
  });

  it("returns adapted weights when sufficient data", () => {
    const outcomes = Array.from({ length: 10 }, () => makeOutcome());
    const result = computeAdaptiveWeights(outcomes);
    expect(result).not.toBeNull();
    expect(result!.weights).toBeDefined();
    expect(result!.adjustments).toBeDefined();
  });

  it("adapted weights sum to approximately 1.0", () => {
    const outcomes = Array.from({ length: 10 }, (_, i) =>
      makeOutcome({
        scores: {
          access: 50 + i * 5,
          drainage: 40 + i * 3,
          adjacency: 60 + i * 2,
          environmental: 70 + i * 4,
          utilities: 55 + i * 3,
          politics: 30 + i * 2,
          zoning: 65 + i * 3,
          acreage: 50 + i * 1,
        },
        actualOutcome: i < 5 ? "FAILURE" : "SUCCESS",
        predictedScore: 50 + i * 5,
      }),
    );

    const result = computeAdaptiveWeights(outcomes)!;
    const sum = Object.values(result.weights).reduce((s, v) => s + v, 0);
    expect(sum).toBeCloseTo(1.0, 2);
  });

  it("respects minimum weight floor", () => {
    const outcomes = Array.from({ length: 10 }, (_, i) =>
      makeOutcome({
        scores: {
          access: 90,
          drainage: 90,
          adjacency: 90,
          environmental: 90,
          utilities: 90,
          politics: i < 5 ? 10 : 90, // inversely correlated
          zoning: 90,
          acreage: 90,
        },
        actualOutcome: i < 5 ? "SUCCESS" : "FAILURE",
        predictedScore: 75,
      }),
    );

    const result = computeAdaptiveWeights(outcomes)!;
    // No weight should be below the minimum floor (0.02)
    for (const [, weight] of Object.entries(result.weights)) {
      expect(weight).toBeGreaterThanOrEqual(0.02);
    }
  });

  it("uses custom base weights when provided", () => {
    const customWeights = { ...DEFAULT_WEIGHTS, access: 0.3, zoning: 0.05 };
    const outcomes = Array.from({ length: 10 }, () => makeOutcome());
    const result = computeAdaptiveWeights(outcomes, customWeights);
    expect(result).not.toBeNull();
    // Adapted weights should differ from custom base
    expect(result!.weights).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// computeProjectionBiases
// ---------------------------------------------------------------------------

describe("computeProjectionBiases", () => {
  it("returns empty array for empty input", () => {
    const result = computeProjectionBiases([]);
    expect(result).toEqual([]);
  });

  it("computes correct bias for single metric", () => {
    const actuals = [
      { metric: "rent_growth", predicted: 100, actual: 88 },
      { metric: "rent_growth", predicted: 200, actual: 176 },
      { metric: "rent_growth", predicted: 150, actual: 132 },
    ];
    const biases = computeProjectionBiases(actuals);
    expect(biases).toHaveLength(1);
    expect(biases[0].metric).toBe("rent_growth");
    // All ratios are 0.88, so meanRatio should be 0.88
    expect(biases[0].meanRatio).toBe(0.88);
    expect(biases[0].sampleSize).toBe(3);
    expect(biases[0].correctionFactor).toBe(0.88);
  });

  it("groups biases by metric", () => {
    const actuals = [
      { metric: "rent_growth", predicted: 100, actual: 90 },
      { metric: "construction_cost", predicted: 100, actual: 110 },
      { metric: "rent_growth", predicted: 200, actual: 180 },
    ];
    const biases = computeProjectionBiases(actuals);
    expect(biases).toHaveLength(2);
    const rentBias = biases.find((b) => b.metric === "rent_growth")!;
    const costBias = biases.find((b) => b.metric === "construction_cost")!;
    expect(rentBias.sampleSize).toBe(2);
    expect(costBias.sampleSize).toBe(1);
  });

  it("clamps extreme correction factors", () => {
    const actuals = [
      { metric: "extreme_over", predicted: 100, actual: 10 }, // ratio 0.1
      { metric: "extreme_under", predicted: 100, actual: 500 }, // ratio 5.0
    ];
    const biases = computeProjectionBiases(actuals);
    const over = biases.find((b) => b.metric === "extreme_over")!;
    const under = biases.find((b) => b.metric === "extreme_under")!;
    expect(over.correctionFactor).toBe(0.5); // clamped
    expect(under.correctionFactor).toBe(1.5); // clamped
  });

  it("skips entries with predicted = 0", () => {
    const actuals = [
      { metric: "test", predicted: 0, actual: 100 },
      { metric: "test", predicted: 100, actual: 80 },
    ];
    const biases = computeProjectionBiases(actuals);
    expect(biases[0].sampleSize).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// computeTierCalibration
// ---------------------------------------------------------------------------

describe("computeTierCalibration", () => {
  it("computes calibration for all tiers", () => {
    const outcomes = [
      makeOutcome({ predictedScore: 80, actualOutcome: "SUCCESS" }), // Green
      makeOutcome({ predictedScore: 85, actualOutcome: "SUCCESS" }), // Green
      makeOutcome({ predictedScore: 72, actualOutcome: "FAILURE" }), // Green
      makeOutcome({ predictedScore: 55, actualOutcome: "PARTIAL" }), // Yellow
      makeOutcome({ predictedScore: 50, actualOutcome: "SUCCESS" }), // Yellow
      makeOutcome({ predictedScore: 20, actualOutcome: "FAILURE" }), // Red
      makeOutcome({ predictedScore: 30, actualOutcome: "FAILURE" }), // Red
    ];

    const calibration = computeTierCalibration(outcomes);
    expect(calibration).toHaveLength(3);

    const green = calibration.find((c) => c.tier === "Green")!;
    expect(green.totalDeals).toBe(3);
    expect(green.successRate).toBeCloseTo(0.667, 2);
    expect(green.failureRate).toBeCloseTo(0.333, 2);

    const yellow = calibration.find((c) => c.tier === "Yellow")!;
    expect(yellow.totalDeals).toBe(2);
    expect(yellow.successRate).toBe(0.5);

    const red = calibration.find((c) => c.tier === "Red")!;
    expect(red.totalDeals).toBe(2);
    expect(red.failureRate).toBe(1.0);
  });

  it("handles empty outcomes", () => {
    const calibration = computeTierCalibration([]);
    expect(calibration).toHaveLength(3);
    for (const tier of calibration) {
      expect(tier.totalDeals).toBe(0);
      expect(tier.successRate).toBe(0);
      expect(tier.failureRate).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// buildOutcomeTrackingSummary
// ---------------------------------------------------------------------------

describe("buildOutcomeTrackingSummary", () => {
  it("returns insufficient_data for small datasets", () => {
    const summary = buildOutcomeTrackingSummary([], []);
    expect(summary.confidenceLevel).toBe("insufficient_data");
    expect(summary.totalOutcomes).toBe(0);
    expect(summary.adaptedWeights).toBeNull();
    expect(summary.weightAdjustments).toBeNull();
  });

  it("returns low confidence for 5-14 outcomes", () => {
    const outcomes = Array.from({ length: 8 }, () => makeOutcome());
    const summary = buildOutcomeTrackingSummary(outcomes, []);
    expect(summary.confidenceLevel).toBe("low");
    expect(summary.adaptedWeights).not.toBeNull();
  });

  it("returns medium confidence for 15-49 outcomes", () => {
    const outcomes = Array.from({ length: 25 }, () => makeOutcome());
    const summary = buildOutcomeTrackingSummary(outcomes, []);
    expect(summary.confidenceLevel).toBe("medium");
  });

  it("returns high confidence for 50+ outcomes", () => {
    const outcomes = Array.from({ length: 60 }, () => makeOutcome());
    const summary = buildOutcomeTrackingSummary(outcomes, []);
    expect(summary.confidenceLevel).toBe("high");
  });

  it("integrates projection biases and tier calibration", () => {
    const outcomes = Array.from({ length: 10 }, () => makeOutcome());
    const actuals = [
      { metric: "rent_growth", predicted: 100, actual: 90 },
      { metric: "rent_growth", predicted: 200, actual: 180 },
    ];
    const summary = buildOutcomeTrackingSummary(outcomes, actuals);
    expect(summary.projectionBiases).toHaveLength(1);
    expect(summary.tierCalibration).toHaveLength(3);
    expect(summary.adaptedWeights).not.toBeNull();
    expect(summary.weightAdjustments).not.toBeNull();
  });
});
