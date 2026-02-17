import { describe, expect, it } from "vitest";
import { DEFAULT_ASSUMPTIONS } from "@/stores/financialModelStore";
import {
  computeProbabilityWeightedMetrics,
  withStressScenarioBundle,
} from "./stressTesting";

describe("stressTesting helpers", () => {
  it("builds predefined scenario bundle on top of assumptions", () => {
    const assumptions = withStressScenarioBundle({
      ...DEFAULT_ASSUMPTIONS,
      income: {
        ...DEFAULT_ASSUMPTIONS.income,
        rentPerSf: 9.5,
      },
    });

    expect(assumptions.stressScenarioBundle?.scenarios).toHaveLength(6);
    expect(
      assumptions.stressScenarioBundle?.scenarios.map((scenario) => scenario.id),
    ).toEqual([
      "base",
      "upside",
      "downside",
      "rate_shock_200bps",
      "recession",
      "tenant_loss",
    ]);
    expect(assumptions.stressScenarioBundle?.scenarios[1]?.assumptions.income.rentPerSf).toBeGreaterThan(
      assumptions.stressScenarioBundle?.scenarios[0]?.assumptions.income.rentPerSf ?? 0,
    );
  });

  it("computes probability-weighted expected IRR and equity multiple", () => {
    const weighted = computeProbabilityWeightedMetrics([
      {
        scenario: {
          id: "base",
          name: "Base",
          probabilityPct: 60,
          assumptions: {
            ...DEFAULT_ASSUMPTIONS,
          },
        },
        metrics: { leveredIRR: 0.14, equityMultiple: 1.8 },
      },
      {
        scenario: {
          id: "downside",
          name: "Downside",
          probabilityPct: 40,
          assumptions: {
            ...DEFAULT_ASSUMPTIONS,
          },
        },
        metrics: { leveredIRR: 0.08, equityMultiple: 1.4 },
      },
    ]);

    expect(weighted.expectedLeveredIRR).toBeCloseTo(0.116);
    expect(weighted.expectedEquityMultiple).toBeCloseTo(1.64);
  });
});

