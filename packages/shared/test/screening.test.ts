import { describe, expect, it } from "vitest";

import {
  computeScreening,
  loanConstant,
  computeWeightedDealScore,
  DEFAULT_PLAYBOOK,
} from "../src/scoring/triage.js";
import {
  financialHardFilterCheck,
} from "../src/scoring/hardFilters.js";

/**
 * Tests ported from legacy/python/tests/test_screening_scoring.py.
 * Verify parity with the Python screening engine.
 */

describe("loanConstant", () => {
  it("matches expected value for 7% / 25y", () => {
    expect(loanConstant(0.07, 25)).toBeCloseTo(0.0848135, 4);
  });

  it("falls back to simple amort when rate is 0", () => {
    expect(loanConstant(0.0, 25)).toBeCloseTo(1.0 / 25.0, 12);
  });

  it("throws for non-positive amort years", () => {
    expect(() => loanConstant(0.07, 0)).toThrow();
    expect(() => loanConstant(0.07, -1)).toThrow();
  });
});

describe("computeScreening", () => {
  it("complete inputs are not provisional", () => {
    const result = computeScreening({
      priceBasis: 10_000_000,
      totalProjectCost: 10_300_000,
      squareFeet: 100_000,
      noiInPlace: 900_000,
      noiStabilized: 1_100_000,
      tenantCreditScore: 4.0,
      assetConditionScore: 3.0,
      marketDynamicsScore: 4.0,
    });

    expect(result.scores.isProvisional).toBe(false);
    expect(result.scores.overallScore).not.toBeNull();
    expect(result.scores.overallScore!).toBeGreaterThanOrEqual(1.0);
    expect(result.scores.overallScore!).toBeLessThanOrEqual(5.0);
    expect(result.scores.hardFilterFailed).toBe(false);
    expect(result.scores.missingKeys).toEqual([]);

    // Stabilized NOI should be used for cap-rate scoring when present.
    expect(result.metrics.capRateUsed).toBeCloseTo(1_100_000 / 10_000_000, 4);
    expect(result.metrics.noiUsed).toBeCloseTo(1_100_000, 4);
  });

  it("missing financial values do not penalize qualitative score", () => {
    const result = computeScreening({
      tenantCreditScore: 4.0,
      assetConditionScore: 2.0,
      marketDynamicsScore: 3.0,
    });

    expect(result.scores.isProvisional).toBe(true);
    expect(result.scores.financialScore).toBeNull();
    expect(result.scores.qualitativeScore).toBeCloseTo(3.0, 9);
    expect(result.scores.overallScore).toBeCloseTo(result.scores.qualitativeScore!, 9);
    expect(result.scores.hardFilterFailed).toBe(false);
    expect(result.scores.missingKeys).toContain("price_basis");
    expect(result.scores.missingKeys).toContain("noi_in_place");
    expect(result.scores.missingKeys).toContain("noi_stabilized");
  });

  it("hard filter fails DSCR only when value is present", () => {
    const result = computeScreening({
      priceBasis: 10_000_000,
      totalProjectCost: 12_000_000,
      squareFeet: 100_000,
      noiInPlace: 500_000,
      noiStabilized: 1_500_000,
      tenantCreditScore: 3.0,
      assetConditionScore: 3.0,
      marketDynamicsScore: 3.0,
    });

    expect(result.metrics.dscr).not.toBeNull();
    expect(result.metrics.dscr!).toBeLessThan(DEFAULT_PLAYBOOK.hardFilters.minDscr);
    expect(result.scores.hardFilterFailed).toBe(true);
    expect(result.scores.hardFilterReasons).toContain("dscr");
    // Cap rate + yield spread should pass for these inputs.
    expect(result.scores.hardFilterReasons).not.toContain("cap_rate");
    expect(result.scores.hardFilterReasons).not.toContain("yield_spread");
  });

  it("hard filter flags cap rate when below threshold", () => {
    const result = computeScreening({
      priceBasis: 10_000_000,
      totalProjectCost: 12_000_000,
      squareFeet: 100_000,
      noiInPlace: 1_500_000,
      noiStabilized: 600_000, // 6% cap rate
      tenantCreditScore: 3.0,
      assetConditionScore: 3.0,
      marketDynamicsScore: 3.0,
    });

    expect(result.metrics.capRateUsed).not.toBeNull();
    expect(result.metrics.capRateUsed!).toBeLessThan(DEFAULT_PLAYBOOK.hardFilters.minCapRate);
    expect(result.scores.hardFilterFailed).toBe(true);
    expect(result.scores.hardFilterReasons).toContain("cap_rate");
  });

  it("hard filter flags yield spread when below threshold", () => {
    const result = computeScreening({
      priceBasis: 10_000_000,
      totalProjectCost: 12_000_000,
      squareFeet: 100_000,
      noiInPlace: 1_200_000,
      noiStabilized: 800_000,
      tenantCreditScore: 3.0,
      assetConditionScore: 3.0,
      marketDynamicsScore: 3.0,
    });

    expect(result.metrics.yieldSpread).not.toBeNull();
    expect(result.metrics.yieldSpread!).toBeLessThan(DEFAULT_PLAYBOOK.hardFilters.minYieldSpread);
    expect(result.scores.hardFilterFailed).toBe(true);
    expect(result.scores.hardFilterReasons).toContain("yield_spread");
  });

  it("handles entirely empty inputs", () => {
    const result = computeScreening({});

    expect(result.scores.isProvisional).toBe(true);
    expect(result.scores.financialScore).toBeNull();
    expect(result.scores.qualitativeScore).toBeNull();
    expect(result.scores.overallScore).toBeNull();
    expect(result.scores.hardFilterFailed).toBe(false);
    expect(result.scores.missingKeys.length).toBeGreaterThan(0);
  });

  it("provisional total cost is derived from defaults when not provided", () => {
    const result = computeScreening({
      priceBasis: 10_000_000,
      squareFeet: 100_000,
      noiInPlace: 900_000,
      noiStabilized: 1_100_000,
      tenantCreditScore: 4.0,
      assetConditionScore: 3.0,
      marketDynamicsScore: 4.0,
    });

    // totalProjectCost was not provided so it should be computed
    expect(result.metrics.totalCost).not.toBeNull();
    expect(result.metrics.totalCost!).toBeGreaterThan(10_000_000);
  });
});

describe("financialHardFilterCheck", () => {
  it("passes when all metrics are above thresholds", () => {
    const result = financialHardFilterCheck({
      dscr: 1.50,
      capRate: 0.09,
      yieldSpread: 0.03,
    });
    expect(result.passed).toBe(true);
    expect(result.disqualifiers).toHaveLength(0);
  });

  it("fails when dscr is below threshold", () => {
    const result = financialHardFilterCheck({
      dscr: 1.10,
      capRate: 0.09,
      yieldSpread: 0.03,
    });
    expect(result.passed).toBe(false);
    expect(result.disqualifiers).toContain("dscr");
  });

  it("passes when values are missing", () => {
    const result = financialHardFilterCheck({});
    expect(result.passed).toBe(true);
  });
});

describe("computeWeightedDealScore", () => {
  it("computes correct tier for high scores", () => {
    const result = computeWeightedDealScore({
      financial: 95,
      location: 90,
      utilities: 85,
      zoning: 90,
      market: 85,
      risk: 80,
    });
    expect(result.tier).toBe("A");
    expect(result.totalScore).toBeGreaterThanOrEqual(85);
  });

  it("computes correct tier for medium scores", () => {
    const result = computeWeightedDealScore({
      financial: 70,
      location: 75,
      utilities: 70,
      zoning: 70,
      market: 70,
      risk: 65,
    });
    expect(result.tier).toBe("B");
    expect(result.totalScore).toBeGreaterThanOrEqual(70);
    expect(result.totalScore).toBeLessThan(85);
  });

  it("normalizes scores <= 1 as decimals", () => {
    const result = computeWeightedDealScore({
      financial: 0.95,
      location: 0.90,
      utilities: 0.85,
      zoning: 0.90,
      market: 0.85,
      risk: 0.80,
    });
    // 0.95 * 100 = 95, same as the explicit test
    expect(result.tier).toBe("A");
  });

  it("returns tier D for low scores", () => {
    const result = computeWeightedDealScore({
      financial: 30,
      location: 40,
      utilities: 35,
      zoning: 30,
      market: 25,
      risk: 20,
    });
    expect(result.tier).toBe("D");
    expect(result.totalScore).toBeLessThan(55);
  });

  it("allows custom weight overrides", () => {
    const result = computeWeightedDealScore(
      { financial: 100, location: 0, utilities: 0, zoning: 0, market: 0, risk: 0 },
      { financial: 1.0, location: 0, utilities: 0, zoning: 0, market: 0, risk: 0 },
    );
    expect(result.totalScore).toBe(100);
  });
});
