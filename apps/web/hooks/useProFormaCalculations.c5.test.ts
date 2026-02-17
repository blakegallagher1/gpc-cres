import { describe, expect, it } from "vitest";
import { DEFAULT_ASSUMPTIONS } from "@/stores/financialModelStore";
import { modelExitScenarios } from "@/hooks/useProFormaCalculations";

function irrScore(value: number | null): number {
  return value === null ? Number.NEGATIVE_INFINITY : value;
}

describe("modelExitScenarios C5", () => {
  it("models sell, refinance-hold, and stabilization paths", () => {
    const analysis = modelExitScenarios(DEFAULT_ASSUMPTIONS);
    const sellScenarios = analysis.scenarios.filter((scenario) => scenario.path === "sell");
    const refinanceScenarios = analysis.scenarios.filter(
      (scenario) => scenario.path === "refinance_hold",
    );
    const stabilizationScenarios = analysis.scenarios.filter(
      (scenario) => scenario.path === "stabilization_disposition",
    );

    expect(sellScenarios).toHaveLength(10);
    expect(
      new Set(sellScenarios.map((scenario) => scenario.timing.sellYear)),
    ).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
    expect(refinanceScenarios.length).toBeGreaterThan(0);
    expect(stabilizationScenarios).toHaveLength(1);
  });

  it("returns ranked scenarios with IRR-max timing metadata", () => {
    const analysis = modelExitScenarios(DEFAULT_ASSUMPTIONS);
    const ranked = analysis.rankedScenarios;

    expect(ranked.length).toBeGreaterThan(10);
    expect(analysis.sellStrategy.bestTiming).not.toBeNull();
    expect(analysis.refinanceStrategy.bestTiming).not.toBeNull();
    expect(analysis.overallBestScenarioId).toBeTruthy();

    for (let i = 1; i < ranked.length; i += 1) {
      expect(irrScore(ranked[i - 1].irr)).toBeGreaterThanOrEqual(
        irrScore(ranked[i].irr),
      );
    }

    const example = ranked[0];
    expect(example.exitValue).toEqual(expect.any(Number));
    expect(example.equityProceeds).toEqual(expect.any(Number));
    expect(example.equityMultiple).toEqual(expect.any(Number));
    expect(example.irrMaximizingExitTiming.sellYear).toEqual(expect.any(Number));
    expect(example.irrMaximizingExitTiming.exitYear).toEqual(expect.any(Number));
    expect(
      example.irrMaximizingExitTiming.refinanceYear === null ||
        typeof example.irrMaximizingExitTiming.refinanceYear === "number",
    ).toBe(true);
  });
});
