import { describe, expect, it } from "vitest";

import { computeEntitlementPathPredictions } from "../src/decision/entitlementIntelligence.js";

describe("computeEntitlementPathPredictions", () => {
  it("predicts approval probability and timeline quantiles by strategy path", () => {
    const predictions = computeEntitlementPathPredictions([
      {
        strategyKey: "by_right",
        strategyLabel: "By Right",
        decision: "approved",
        timelineDays: 88,
      },
      {
        strategyKey: "by_right",
        strategyLabel: "By Right",
        decision: "approved_with_conditions",
        timelineDays: 112,
      },
      {
        strategyKey: "cup",
        strategyLabel: "Conditional Use Permit",
        decision: "denied",
        timelineDays: 210,
      },
      {
        strategyKey: "cup",
        strategyLabel: "Conditional Use Permit",
        decision: "approved",
        timelineDays: 165,
      },
    ]);

    expect(predictions).toHaveLength(2);
    expect(predictions[0].strategyKey).toBe("by_right");
    expect(predictions[0].probabilityApproval).toBeGreaterThan(predictions[1].probabilityApproval);
    expect(predictions[0].expectedDaysP50).toBeLessThan(predictions[1].expectedDaysP50);
    expect(predictions[0].expectedDaysP75).toBeGreaterThanOrEqual(predictions[0].expectedDaysP50);
    expect(predictions[0].expectedDaysP90).toBeGreaterThanOrEqual(predictions[0].expectedDaysP75);
  });

  it("derives timeline days from submitted and decision dates when timelineDays is absent", () => {
    const predictions = computeEntitlementPathPredictions([
      {
        strategyKey: "rezoning",
        strategyLabel: "Rezoning",
        decision: "approved",
        submittedAt: "2025-01-01",
        decisionAt: "2025-06-30",
      },
      {
        strategyKey: "rezoning",
        strategyLabel: "Rezoning",
        decision: "approved_with_conditions",
        submittedAt: "2025-02-01",
        decisionAt: "2025-07-31",
      },
    ]);

    expect(predictions).toHaveLength(1);
    expect(predictions[0].timelineSampleSize).toBe(2);
    expect(predictions[0].expectedDaysP50).toBeGreaterThanOrEqual(170);
  });

  it("supports excluding strategies below the required minimum sample size", () => {
    const predictions = computeEntitlementPathPredictions(
      [
        {
          strategyKey: "variance",
          strategyLabel: "Variance",
          decision: "approved",
          timelineDays: 120,
        },
      ],
      { minSampleSize: 2, includeBelowMinSample: false },
    );

    expect(predictions).toHaveLength(0);
  });

  it("returns empty predictions for empty datasets", () => {
    const predictions = computeEntitlementPathPredictions([]);
    expect(predictions).toEqual([]);
  });
});
